-- Variant stock: make products.stock_quantity a derived sum of variant stocks.
--
-- Problem:
--   For variant-based products, `products.stock_quantity` and
--   `product_variants.stock` were maintained as two INDEPENDENT numbers set
--   manually by the admin. The `decrement_stock` RPC decremented BOTH on every
--   order (parent + variant), so the two counters drifted and told different
--   stories about availability. Stock was effectively "not maintained" for
--   variant products, and overselling silently floored stock at 0.
--
-- Fix (Model C, trigger-based):
--   1. `products.stock_quantity` becomes DERIVED for variant products:
--      a trigger on product_variants recomputes it as SUM(variant.stock).
--   2. `decrement_stock` only decrements the variant (the parent is recomputed
--      by the trigger) — removes the double-decrement.
--   3. Oversell guard: decrement_stock raises instead of flooring to 0 when
--      stock is insufficient.
--   4. CHECK (stock >= 0) on product_variants.stock.
--   5. Non-destructive backfill: recompute stock_quantity for existing
--      variant products (repairs the inconsistent/corrupted counts).
--
-- Trigger safety / recursion:
--   The trigger only WRITES products.stock_quantity (the PARENT table). It
--   never writes back into product_variants, so it cannot recurse into
--   itself. Variant-level stock remains owned solely by its writers
--   (decrement_stock RPC + the admin product action).
--
-- SECURITY DEFINER note:
--   The trigger runs as the owner so the SUM always sees ALL variants for the
--   product regardless of the caller's RLS (same pattern as order numbering).

-- 1. Parent-sum trigger function -------------------------------------------

CREATE OR REPLACE FUNCTION public.sync_product_stock_from_variants()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_product_ids uuid[];
  v_id uuid;
BEGIN
  -- Collect the product(s) affected. On an UPDATE where the variant moved to
  -- a different product, BOTH old and new products need recomputing.
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    v_product_ids := v_product_ids || NEW.product_id;
  END IF;
  IF TG_OP IN ('DELETE', 'UPDATE') THEN
    IF TG_OP = 'DELETE' OR OLD.product_id IS DISTINCT FROM NEW.product_id THEN
      v_product_ids := v_product_ids || OLD.product_id;
    END IF;
  END IF;

  FOREACH v_id IN ARRAY v_product_ids LOOP
    CONTINUE WHEN v_id IS NULL;
    UPDATE public.products
    SET stock_quantity = COALESCE(
      (SELECT SUM(v.stock) FROM public.product_variants v WHERE v.product_id = v_id),
      0
    )
    WHERE id = v_id;
  END LOOP;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_product_stock_from_variants ON public.product_variants;
CREATE TRIGGER trg_sync_product_stock_from_variants
  AFTER INSERT OR UPDATE OR DELETE ON public.product_variants
  FOR EACH ROW EXECUTE FUNCTION public.sync_product_stock_from_variants();

-- 2. Rewrite decrement_stock (DROP + CREATE, not REPLACE, so cached plans
--    are invalidated — see the order-numbering lesson) ---------------------

DROP FUNCTION IF EXISTS public.decrement_stock(uuid, uuid, decimal);

CREATE OR REPLACE FUNCTION public.decrement_stock(
  p_product_id UUID,
  p_variant_id UUID DEFAULT NULL,
  p_quantity DECIMAL DEFAULT 1
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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

    IF v_current < p_quantity THEN
      RAISE EXCEPTION 'Insufficient stock for variant % (available %, requested %)',
        p_variant_id, v_current, p_quantity;
    END IF;

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

    IF v_current < p_quantity THEN
      RAISE EXCEPTION 'Insufficient stock for product % (available %, requested %)',
        p_product_id, v_current, p_quantity;
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
$$;

-- 3. Constraint: variant stock cannot go negative ---------------------------

ALTER TABLE public.product_variants
  DROP CONSTRAINT IF EXISTS product_variants_stock_non_negative;
ALTER TABLE public.product_variants
  ADD CONSTRAINT product_variants_stock_non_negative
  CHECK (stock >= 0);

-- 4. Non-destructive backfill: recompute parent stock for variant products --
--    This repairs the historically inconsistent stock_quantity values. Non-
--    variant products are left untouched (no variants to sum).

UPDATE public.products p
SET stock_quantity = COALESCE(
  (SELECT SUM(v.stock) FROM public.product_variants v WHERE v.product_id = p.id),
  0
)
WHERE EXISTS (
  SELECT 1 FROM public.product_variants v WHERE v.product_id = p.id
);
