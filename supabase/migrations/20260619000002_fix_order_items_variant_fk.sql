-- Fix order_items.variant_id foreign key to allow variant deletion
--
-- P12 first-pass fix only addressed inventory_log.variant_id_fkey. Live
-- reproduction after P12 (santoor soap, 4 duplicate "santoor 80g" variants
-- created between 11:17 and 11:43 on 2026-06-19) revealed a SECOND FK with
-- the same bug: order_items.variant_id_fkey.
--
-- An order placed at 11:35 against variant 1db8b89f created an order_items
-- row with variant_id=1db8b89f. When the user then tried to save the product
-- with that variant removed, the action's DELETE failed with FK violation
-- 23503 (exactly like P12), the action threw, the insert didn't run, but
-- the user reported "multiplication" because the existing variants were
-- still all there AND the form's on-screen state was now out of sync with
-- the DB (the form had 3, the DB had 4).
--
-- Fix: same as P12 — change the FK to ON DELETE SET NULL. The variant_id
-- column is already nullable. order_items still references the product via
-- product_id (NOT NULL), so the order line is preserved. The variant
-- reference is nulled (the audit trail is in orders + order_items, not in
-- the variant).

ALTER TABLE public.order_items
  DROP CONSTRAINT IF EXISTS order_items_variant_id_fkey;

ALTER TABLE public.order_items
  ADD CONSTRAINT order_items_variant_id_fkey
  FOREIGN KEY (variant_id)
  REFERENCES public.product_variants(id)
  ON DELETE SET NULL;

-- ----------------------------------------------------------------------------
-- FK audit (out of P14 scope, documented for follow-up):
-- Other NO ACTION FKs that could block parent-row deletion the same way:
--   products.category_id_fkey   → categories.id  (blocks category deletion)
--   products.store_id_fkey      → stores.id      (blocks store deletion)
--   inventory_log.product_id_fkey  → products.id (blocks product deletion)
--   order_items.product_id_fkey    → products.id (blocks product deletion)
--   banners.store_id_fkey       → stores.id
--   delivery_slots.store_id_fkey → stores.id
--   delivery_zones.store_id_fkey → stores.id
--   gst_numbers.store_id_fkey   → stores.id
--   orders.store_id_fkey        → stores.id
--   profiles.store_id_fkey      → stores.id
-- These are handled today by manual cascade in the action layer
-- (deleteProduct, deleteCategory, deleteStore do explicit child-deletes
-- before the parent delete). The schema should be normalized to use
-- ON DELETE CASCADE or SET NULL where appropriate. See TEST_REPORT.md P14
-- for the full audit table and B24 in the consolidated bugs list.
-- ----------------------------------------------------------------------------
