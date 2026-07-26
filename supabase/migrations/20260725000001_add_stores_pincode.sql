-- Add pincode column to stores (used by invoice PDF/detail for store address).
-- The column was referenced in code but never added via migration.
ALTER TABLE stores ADD COLUMN IF NOT EXISTS pincode TEXT;
