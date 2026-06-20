-- Fix inventory_log.product_id and order_items.product_id foreign keys
--
-- P14 follow-up (B24 partial fix): Two more NO ACTION FKs blocked product
-- deletion the same way P12 and P14 blocked variant deletion. Live user
-- report: "Failed to delete product if one order is placed and once order
-- is deleted unable to delete the products — from superadmin, store admin."
--
-- Investigation:
--   - inventory_log.product_id_fkey    (NO ACTION, NOT NULL) — blocks delete
--   - order_items.product_id_fkey      (NO ACTION, NOT NULL) — blocks delete
--
-- User scenario:
--   1. User places an order for a product → order_items row + inventory_log row
--      are created (the latter by the decrement_stock RPC)
--   2. User tries to delete the product → FAILS with FK 23503 (order_items
--      references the product)
--   3. User deletes the order via deleteOrder → order_items row is deleted
--      BUT inventory_log row is NOT deleted (deleteOrder doesn't touch
--      inventory_log)
--   4. User tries to delete the product AGAIN → STILL FAILS with FK 23503
--      (now from inventory_log)
--
-- This affected all roles (superadmin, store admin) because the FK is at the
-- DB level, not the application level.
--
-- Fix: Make both columns nullable + change both FKs to ON DELETE SET NULL.
-- This is the same pattern as P12 (variant) and P14 (order_items.variant_id):
-- preserve the audit/history data but allow the parent row to be deleted.
--
-- Why SET NULL over CASCADE:
--   - inventory_log is an audit trail. CASCADE would delete the stock-change
--     record when the product is deleted, losing the audit. SET NULL keeps
--     the row (still has variant_id, quantity_change, running_balance, reason,
--     notes) but nulls the product reference.
--   - order_items is order history. The order_items row has unit_price and
--     total_price snapshotted from the time of order, so the order is
--     still complete. SET NULL keeps the row for accounting/reporting.
--   - CASCADE would lose both audit trails permanently.
--
-- The orders table itself is independent — it doesn't reference products
-- directly. The orders.id → order_items.order_id relationship is preserved.

-- 1. Make the columns nullable (required for SET NULL)
ALTER TABLE public.inventory_log
  ALTER COLUMN product_id DROP NOT NULL;

ALTER TABLE public.order_items
  ALTER COLUMN product_id DROP NOT NULL;

-- 2. Replace the FK constraints with ON DELETE SET NULL
ALTER TABLE public.inventory_log
  DROP CONSTRAINT IF EXISTS inventory_log_product_id_fkey;

ALTER TABLE public.inventory_log
  ADD CONSTRAINT inventory_log_product_id_fkey
  FOREIGN KEY (product_id)
  REFERENCES public.products(id)
  ON DELETE SET NULL;

ALTER TABLE public.order_items
  DROP CONSTRAINT IF EXISTS order_items_product_id_fkey;

ALTER TABLE public.order_items
  ADD CONSTRAINT order_items_product_id_fkey
  FOREIGN KEY (product_id)
  REFERENCES public.products(id)
  ON DELETE SET NULL;

-- ----------------------------------------------------------------------------
-- FK audit (out of P15 scope, documented for follow-up):
-- Remaining NO ACTION FKs that could block parent-row deletion the same way:
--   products.category_id_fkey   → categories.id  (blocks category deletion)
--   products.store_id_fkey      → stores.id      (blocks store deletion)
--   banners.store_id_fkey       → stores.id
--   delivery_slots.store_id_fkey → stores.id
--   delivery_zones.store_id_fkey → stores.id
--   gst_numbers.store_id_fkey   → stores.id
--   orders.store_id_fkey        → stores.id
--   profiles.store_id_fkey      → stores.id
-- These are all handled today by manual cascade in the action layer
-- (deleteCategory, deleteStore, etc. do explicit child-deletes before the
-- parent delete). The schema should be normalized to use ON DELETE CASCADE
-- or SET NULL where appropriate. See TEST_REPORT.md P14 audit table and
-- B24 in the consolidated bugs list.
-- ----------------------------------------------------------------------------
