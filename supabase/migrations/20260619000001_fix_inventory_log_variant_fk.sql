-- Fix inventory_log.variant_id foreign key to allow variant deletion
--
-- BUG: The inventory_log.variant_id_fkey was created without ON DELETE behavior,
-- defaulting to NO ACTION. This blocked delete operations on product_variants
-- when inventory_log rows referenced them, causing updateProduct to silently
-- fail (the action discards the delete error) and then insert new variants
-- on top of the existing ones — effectively duplicating variants on every save.
--
-- Fix: Change the FK to ON DELETE SET NULL so that:
--   1. Variants can be deleted (e.g. when a product's variant set is replaced)
--   2. The inventory_log audit trail is preserved (variant_id is nulled)
--   3. product_id still references the product, so order totals/balances remain queryable
--
-- The variant_id column is already nullable; this only changes the referential
-- action when a parent row is deleted.

ALTER TABLE public.inventory_log
  DROP CONSTRAINT IF EXISTS inventory_log_variant_id_fkey;

ALTER TABLE public.inventory_log
  ADD CONSTRAINT inventory_log_variant_id_fkey
  FOREIGN KEY (variant_id)
  REFERENCES public.product_variants(id)
  ON DELETE SET NULL;
