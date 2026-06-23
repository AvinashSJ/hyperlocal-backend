-- ============================================================================
-- P48: Auto-populate orders.store_id from order_items → products.store_id
-- ----------------------------------------------------------------------------
-- The customer-facing Flutter app creates `orders` rows but does NOT set
-- `orders.store_id` (or sets it to NULL). This breaks store-scoping on the
-- admin side: a Manager with `profile.store_id = "X"` and an order with
-- `orders.store_id = NULL` is invisible to that Manager because the
-- `eq("store_id", "X")` filter excludes NULL rows.
--
-- Symptom: a Store Manager logs in, sees no orders/customers/invoices for
-- their store, even though customers are actively placing orders. The
-- P47 read-side guard catches Managers with `profile.store_id IS NULL`,
-- but the data here is the inverse: the Manager is correctly linked, the
-- ORDER has a null `store_id`.
--
-- This migration has two parts:
--
-- 1. BACKFILL: for every existing order where `store_id IS NULL`, set it
--    to the most plausible `store_id` from its order_items → products.
--    We use the store_id of the FIRST order_item (which usually corresponds
--    to the cart's main product). If no order_item has a product with a
--    non-null `store_id`, the order stays NULL — it has to be fixed by hand
--    (no signal survives).
--
-- 2. TRIGGER: for future orders, an AFTER INSERT trigger on
--    `order_items` sets the parent order's `store_id` to the new
--    product's `store_id` IF AND ONLY IF the order's `store_id` IS NULL.
--    This means:
--      - The FIRST order_item inserted (typically the first product in
--        the cart) wins and sets the order's store_id.
--      - Subsequent order_items do NOT override — even if they belong to
--        a different store (mixed-cart edge case, but defensive).
--      - The Flutter app is unchanged: it doesn't need to know about this
--        trigger. If the Flutter app DOES set `orders.store_id` explicitly,
--        the trigger leaves it alone (because it's not NULL).
--      - If the product has `store_id = NULL` (super admin's orphan
--        product), the order's store_id stays NULL — no signal.
--
-- Idempotent: the backfill only updates rows where `store_id IS NULL`,
-- so running it multiple times is safe. The trigger uses `CREATE OR
-- REPLACE` and `DROP TRIGGER IF EXISTS` so re-runs are safe too.
--
-- Revert: DROP TRIGGER IF EXISTS order_items_set_order_store_id ON
-- public.order_items; DROP FUNCTION IF EXISTS public.set_order_store_id();
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. BACKFILL existing orders
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_fixed   BIGINT := 0;
  v_skipped BIGINT := 0;
BEGIN
  WITH first_product_per_order AS (
    SELECT DISTINCT ON (oi.order_id)
           oi.order_id,
           p.store_id
    FROM public.order_items oi
    JOIN public.products p ON p.id = oi.product_id
    WHERE p.store_id IS NOT NULL
      AND EXISTS (SELECT 1 FROM public.stores s WHERE s.id = p.store_id)
    ORDER BY oi.order_id, oi.created_at NULLS LAST, oi.id
  ),
  updated AS (
    UPDATE public.orders o
    SET store_id = fppo.store_id
    FROM first_product_per_order fppo
    WHERE o.id = fppo.order_id
      AND o.store_id IS NULL
    RETURNING o.id
  )
  SELECT COUNT(*) INTO v_fixed FROM updated;

  -- Count remaining NULLs (orders whose items have no usable store signal)
  SELECT COUNT(*) INTO v_skipped
  FROM public.orders
  WHERE store_id IS NULL;

  RAISE NOTICE 'P48: Backfilled % order(s). % still have NULL store_id (need manual fix).', v_fixed, v_skipped;
END $$;

-- ----------------------------------------------------------------------------
-- 2. TRIGGER: auto-populate orders.store_id on order_items INSERT
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_order_store_id() RETURNS trigger AS $$
DECLARE
  v_product_store_id UUID;
BEGIN
  -- Look up the product's store_id. If the product has no store_id
  -- (e.g. a super-admin product) or doesn't exist anymore, do nothing.
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

  -- Only set the order's store_id if it's currently NULL. This means:
  --   - The first order_item inserted wins (typically the first product
  --     in the cart).
  --   - Subsequent items do NOT override.
  --   - Flutter-side explicit sets are preserved (because they're not NULL).
  UPDATE public.orders
  SET    store_id = v_product_store_id
  WHERE  id = NEW.order_id
    AND  store_id IS NULL;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS order_items_set_order_store_id ON public.order_items;
CREATE TRIGGER order_items_set_order_store_id
  AFTER INSERT ON public.order_items
  FOR EACH ROW EXECUTE FUNCTION public.set_order_store_id();
