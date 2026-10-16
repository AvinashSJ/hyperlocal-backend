-- Allow overselling: orders must never be blocked by insufficient stock.
--
-- Bug: two customers ordering the same item at once (stock 84, one takes 50,
-- the other takes 50) meant the second place_order call failed outright — the
-- RPC loops PERFORM decrement_stock(...) per item, and decrement_stock raised
-- 'Insufficient stock ...', rolling back the whole order. Wholesale wants both
-- orders to go through; stock is reconciled later (negative is acceptable).
--
-- Two hard blocks:
--   1. product_variants_stock_non_negative CHECK (stock >= 0) — rejects the
--      UPDATE that would push a variant below zero.
--   2. decrement_stock() raising 'Insufficient stock' in both branches.
--
-- products.stock_quantity already had no non-negative guard, and the
-- sync_product_stock_from_variants() trigger just SUMs variants, so it already
-- tolerates negatives.
--
-- Behavior retained:
--   * products.status still auto-flips to 'out_of_stock' when a non-variant
--     product's stock reaches 0 or below.
--   * quantity must still be positive; missing product/variant still raises.

-- 1. Drop the non-negative guard on variant stock.
ALTER TABLE public.product_variants
  DROP CONSTRAINT IF EXISTS product_variants_stock_non_negative;

-- 2. Replace decrement_stock without the insufficiency RAISEs.
--    DROP + CREATE (not just REPLACE) to force plan-cache invalidation.
DROP FUNCTION IF EXISTS public.decrement_stock(uuid, uuid, numeric);

CREATE FUNCTION public.decrement_stock(
  p_product_id uuid,
  p_variant_id uuid DEFAULT NULL::uuid,
  p_quantity numeric DEFAULT 1
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
DECLARE
  v_new_stock DECIMAL;
  v_current DECIMAL;
BEGIN
  IF p_quantity <= 0 THEN
    RAISE EXCEPTION 'Quantity must be positive (got %)', p_quantity;
  END IF;

  IF p_variant_id IS NOT NULL THEN
    -- Variant-based product: decrement ONLY the variant. The parent
    -- products.stock_quantity is recomputed by the trigger (sum of variants),
    -- so we must NOT decrement it here too (that was the double-decrement bug).
    SELECT COALESCE(stock, 0) INTO v_current
    FROM public.product_variants
    WHERE id = p_variant_id;

    IF v_current IS NULL THEN
      RAISE EXCEPTION 'Variant % does not exist', p_variant_id;
    END IF;

    -- Overselling is allowed: stock may drop below zero (reconciled later).
    UPDATE public.product_variants
    SET stock = stock - p_quantity
    WHERE id = p_variant_id
    RETURNING stock INTO v_new_stock;
  ELSE
    -- Non-variant product: decrement the product stock directly.
    SELECT COALESCE(stock_quantity, 0) INTO v_current
    FROM public.products
    WHERE id = p_product_id;

    IF v_current IS NULL THEN
      RAISE EXCEPTION 'Product % does not exist', p_product_id;
    END IF;

    UPDATE public.products
    SET
      stock_quantity = stock_quantity - p_quantity,
      status = CASE
        WHEN stock_quantity - p_quantity <= 0 THEN 'out_of_stock'
        ELSE status
      END
    WHERE id = p_product_id
    RETURNING stock_quantity INTO v_new_stock;
  END IF;

  -- Log to inventory_log (only reached on a successful decrement)
  INSERT INTO public.inventory_log (
    product_id,
    variant_id,
    quantity_change,
    running_balance,
    reason_code,
    notes
  ) VALUES (
    p_product_id,
    p_variant_id,
    -p_quantity,
    v_new_stock,
    'sale',
    'Order placed'
  );
END;
$function$;
