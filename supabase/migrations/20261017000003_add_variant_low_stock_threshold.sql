-- Per-variant low-stock threshold.
--
-- Low-stock alerting was product-level only: a variant product's
-- products.stock_quantity is the SUM of its variants, so a product with one
-- critical variant (2 left) and one healthy variant (500 left) never alerted,
-- while a product with many small-but-adequate variants alerted spuriously.
--
-- Add an optional per-variant threshold. Resolution order for a variant:
--   variant.low_stock_threshold ?? product.low_stock_threshold ?? 10
-- For non-variant products: product.low_stock_threshold ?? 10.
--
-- NULL means "inherit" (product threshold, then the default of 10).

ALTER TABLE public.product_variants
  ADD COLUMN IF NOT EXISTS low_stock_threshold numeric;
