-- ============================================================================
-- Fix store deletion: add the missing `stores.updated_at` column.
-- ----------------------------------------------------------------------------
-- `deleteStore` (src/app/(admin)/stores/actions.ts) reads `updated_at` to
-- enforce the "store must be disabled for at least 90 days" rule. The column
-- never existed on `stores` (unlike banners / return_requests / etc.), so the
-- SELECT errored and every delete failed with "Store not found".
--
-- Add the column + the standard `update_updated_at()` trigger. Disabling a
-- store (is_active -> false) now stamps updated_at, which is the timestamp the
-- 90-day rule measures against.
-- ============================================================================

ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

DROP TRIGGER IF EXISTS trg_stores_updated_at ON public.stores;
CREATE TRIGGER trg_stores_updated_at
  BEFORE UPDATE ON public.stores
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();
