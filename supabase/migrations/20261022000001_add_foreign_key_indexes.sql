-- Missing foreign-key indexes causing full seq scans + hash-join temp spills.
-- Prod evidence (Micro / 1 GB): product_images ~20.7M and product_variants
-- ~20.4M seq scans (no product_id index), order_tracks 5.4k seq scans on
-- order_id (only a PK). These indexes target the top memory/CPU consumers.
--
-- NOTE: CREATE INDEX CONCURRENTLY cannot run inside a transaction. Supabase's
-- migration runner wraps statements in a transaction, so on PROD run these as
-- three separate statements in the SQL editor. On TEST the tables are tiny and
-- a plain CREATE INDEX is safe.

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_product_images_product_id
  ON public.product_images(product_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_product_variants_product_id
  ON public.product_variants(product_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_order_tracks_order_id
  ON public.order_tracks(order_id);
