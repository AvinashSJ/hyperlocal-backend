-- Add mrp column to product_variants
--
-- P17 user request: "Variants should reflect MRP & Selling & Discount Columns
-- accordingly as per the standard 'Pricing & Inventory'". Variants are
-- gaining their own MRP field. The product-level MRP/selling_price become a
-- read-only summary derived from min(variant.mrp), min(variant.price) when
-- 1+ variants exist. Discount on variants is auto-computed (read-only)
-- using the same formatDiscountLabel(mrp, sellingPrice) helper as the
-- product-level.
--
-- Migration:
--   ADD COLUMN mrp DECIMAL(12, 2) NOT NULL DEFAULT 0
--
-- The DEFAULT 0 makes the migration backward-compatible: all existing
-- variants in the DB get mrp=0 automatically (no backfill needed per user
-- choice). New variants can specify mrp explicitly via the form; the
-- addVariant helper defaults to 0 to force manual entry.
--
-- When existing products with variants are saved after this migration, the
-- product-level MRP will be derived from min(variant.mrp), which is 0 for
-- all existing variants. The product will show a "—" discount until the
-- user sets MRP on at least one variant. This is the documented behavior.

ALTER TABLE public.product_variants
  ADD COLUMN IF NOT EXISTS mrp DECIMAL(12, 2) NOT NULL DEFAULT 0;
