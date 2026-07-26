-- ============================================================================
-- Auto-generate order_number using the store's order_id_prefix
-- ----------------------------------------------------------------------------
-- The Flutter app creates orders with a hardcoded "ORD-YYYY-NNNNNN" format,
-- ignoring the store's `order_id_prefix` setting. This migration modifies
-- the existing `set_order_store_id()` trigger (P48) to ALSO regenerate
-- `order_number` when it first sets the store_id.
--
-- Flow:
--   1. Flutter inserts order → order_number = "ORD-2026-000001", store_id = NULL
--   2. Flutter inserts order_items → set_order_store_id() fires
--   3. Trigger sets store_id from product's store
--   4. Trigger ALSO regenerates order_number: {PREFIX}-{SEQ:06d}
--
-- Falls back to "ORD" prefix when the store has no order_id_prefix set.
-- The condition `WHERE store_id IS NULL` ensures this only fires once per order.
-- ============================================================================

-- 1. Global sequence for order numbers
CREATE SEQUENCE IF NOT EXISTS public.order_number_seq;

-- 2. Helper function: generate order_number from store prefix + sequence
CREATE OR REPLACE FUNCTION public.generate_order_number(p_store_id UUID)
RETURNS TEXT AS $$
DECLARE
  v_prefix TEXT;
BEGIN
  IF p_store_id IS NOT NULL THEN
    SELECT COALESCE(order_id_prefix, 'ORD')
      INTO v_prefix
    FROM public.stores
    WHERE id = p_store_id;
  END IF;

  IF v_prefix IS NULL OR v_prefix = '' THEN
    v_prefix := 'ORD';
  END IF;

  RETURN v_prefix || '-' || LPAD(nextval('public.order_number_seq')::TEXT, 6, '0');
END;
$$ LANGUAGE plpgsql;

-- 3. Replace set_order_store_id() to also set order_number
CREATE OR REPLACE FUNCTION public.set_order_store_id() RETURNS trigger AS $$
DECLARE
  v_product_store_id UUID;
BEGIN
  IF NEW.product_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT p.store_id
    INTO v_product_store_id
  FROM public.products p
  WHERE p.id = NEW.product_id;

  IF v_product_store_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Set store_id AND regenerate order_number together.
  -- The condition `store_id IS NULL` ensures this only fires once:
  --   - First order_item wins and sets both store_id + order_number
  --   - Subsequent items skip this block entirely
  UPDATE public.orders
  SET    store_id = v_product_store_id,
         order_number = public.generate_order_number(v_product_store_id)
  WHERE  id = NEW.order_id
    AND  store_id IS NULL;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
