-- P26: Snapshot product name/SKU/HSN code + variant name on order_items.
--
-- Bug: when a product (or variant) is deleted, the order_items.product_id
-- (and variant_id) are SET NULL'd by the FKs fixed in P14/P15. Every UI that
-- reads the product name via JOIN to `products` then shows "—" (or
-- "Deleted Product") instead of the original name. The user reported
-- this on both the admin panel (order detail, invoice detail) and the
-- Flutter mobile app (which also JOINs to products).
--
-- Fix: snapshot the product name/SKU/HSN code and variant name at the time
-- of order placement. Populated automatically by a BEFORE INSERT trigger
-- (so the Flutter app's existing INSERTs get the snapshot for free, no
-- Flutter code change required for the WRITE side). For the READ side, both
-- the admin and the Flutter app should change their SELECT to drop the
-- products JOIN and use the snapshot columns directly.
--
-- For already-placed orders, this migration backfills the snapshot from the
-- current products/product_variants rows (best-effort; rows where the
-- product was already deleted are lost forever — accepted tradeoff, see
-- the open question in TEST_REPORT.md P26).
--
-- This matches the existing pattern of unit_price/total_price/gst_rate/
-- gst_amount which are also snapshotted at order time.

-- 1. Add the snapshot columns (nullable for safe backfill on large tables)
ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS product_name     TEXT,
  ADD COLUMN IF NOT EXISTS product_sku      TEXT,
  ADD COLUMN IF NOT EXISTS variant_name     TEXT,
  ADD COLUMN IF NOT EXISTS product_hsn_code TEXT;

-- 2. Backfill from products/product_variants for any rows where the FK still resolves
--    (i.e. the product/variant hasn't been deleted yet).
UPDATE public.order_items o
SET
  product_name     = p.name,
  product_sku      = p.sku,
  product_hsn_code = p.hsn_code
FROM public.products p
WHERE o.product_id = p.id
  AND o.product_name IS NULL;

UPDATE public.order_items o
SET variant_name = v.name
FROM public.product_variants v
WHERE o.variant_id = v.id
  AND o.variant_name IS NULL;

-- 3. BEFORE INSERT trigger: auto-populate the snapshots from products/
--    product_variants if the insert doesn't provide them. This is
--    transparent to the Flutter app — existing INSERTs get snapshots for free.
CREATE OR REPLACE FUNCTION public.order_items_snapshot() RETURNS trigger AS $$
BEGIN
  -- If product_id is set and the snapshot columns are NULL, copy from products
  IF NEW.product_id IS NOT NULL THEN
    IF NEW.product_name IS NULL OR NEW.product_sku IS NULL OR NEW.product_hsn_code IS NULL THEN
      SELECT name, sku, hsn_code
        INTO NEW.product_name, NEW.product_sku, NEW.product_hsn_code
      FROM public.products
      WHERE id = NEW.product_id;
    END IF;
  END IF;
  -- If variant_id is set and variant_name is NULL, copy from product_variants
  IF NEW.variant_id IS NOT NULL AND NEW.variant_name IS NULL THEN
    SELECT name INTO NEW.variant_name
    FROM public.product_variants
    WHERE id = NEW.variant_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS order_items_snapshot_trigger ON public.order_items;
CREATE TRIGGER order_items_snapshot_trigger
  BEFORE INSERT ON public.order_items
  FOR EACH ROW EXECUTE FUNCTION public.order_items_snapshot();
