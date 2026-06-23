-- ============================================================================
-- P53: Reconcile orders.store_id against CURRENT product store_ids
-- ----------------------------------------------------------------------------
-- The P48 backfill (20260623000004) only updated orders where
-- `orders.store_id IS NULL`. It assigned the order to the store of its
-- first order_item's product. This is best-effort, but two real-world
-- scenarios leave `orders.store_id` STALE:
--
--   1. Product moved between stores after the order was placed
--      (manager edits a product's store_id). The order keeps its
--      original store_id, but no product in the store actually
--      belongs to it anymore.
--
--   2. A backoffice tool or direct SQL set the order's store_id
--      explicitly, bypassing the P48 trigger.
--
-- Symptom: a store's detail page (/stores/[id]) shows invoices that
-- shouldn't be there. The query filter `orders.store_id = X` is
-- honored, but X was set incorrectly. The COUNT and the LIST are
-- both right given the data, but the data is wrong.
--
-- This migration re-runs the P48 backfill but uses CURRENT product
-- store_ids (not NULL-only). For each order with at least one
-- order_item whose product has a usable store_id, the order's
-- store_id is set to that product's CURRENT store_id. Idempotent:
-- the `IS DISTINCT FROM` guard means re-running it is a no-op.
--
-- IMPORTANT: this rewrites `orders.store_id` for orders whose first
-- product moved. The downstream effects:
--   - Per-store invoice numbering (P43) uses `orders.store_id` to
--     derive the prefix. Existing invoice numbers do NOT change
--     (we only update `orders.store_id`, not `invoices`).
--   - The P48 trigger continues to fire on NEW order_items inserts,
--     so forward behavior is unchanged.
--   - Audit log: no per-row activity_log entries are written
--     (migrations run without a user context). Operators can run
--     SELECT id, order_number, store_id FROM orders WHERE
--     updated_at > now() - interval '1 minute' to see what changed.
--
-- Revert: there is no automatic revert. The pre-migration values
-- would need to be restored from a backup. Treat this as a
-- one-way data-correction migration.
-- ============================================================================

DO $$
DECLARE
  v_fixed   BIGINT := 0;
  v_kept    BIGINT := 0;
  v_signal  BIGINT := 0;
BEGIN
  -- Build the "first product per order" mapping using the CURRENT
  -- products table. DISTINCT ON (order_id) picks the first order_item
  -- per order (ordered by created_at, then id as a stable tiebreaker).
  -- We require p.store_id IS NOT NULL and the store still exists.
  WITH first_product_per_order AS (
    SELECT DISTINCT ON (oi.order_id)
           oi.order_id,
           p.store_id
    FROM   public.order_items oi
    JOIN   public.products p ON p.id = oi.product_id
    WHERE  p.store_id IS NOT NULL
      AND  EXISTS (SELECT 1 FROM public.stores s WHERE s.id = p.store_id)
    ORDER  BY oi.order_id, oi.created_at NULLS LAST, oi.id
  ),
  updated AS (
    UPDATE public.orders o
    SET    store_id = fppo.store_id
    FROM   first_product_per_order fppo
    WHERE  o.id = fppo.order_id
      AND  o.store_id IS DISTINCT FROM fppo.store_id
    RETURNING o.id
  )
  SELECT COUNT(*) INTO v_fixed FROM updated;

  -- Orders where the assignment is already correct (sanity count).
  SELECT COUNT(*) INTO v_kept
  FROM   public.orders o
  JOIN   first_product_per_order fppo ON fppo.order_id = o.id
  WHERE  o.store_id = fppo.store_id;

  -- Orders with at least one usable product signal (denominator).
  SELECT COUNT(*) INTO v_signal FROM first_product_per_order;

  RAISE NOTICE 'P53: Reconciled % order(s) with stale store_id. % already correct. % orders had a usable product signal.', v_fixed, v_kept, v_signal;
END $$;
