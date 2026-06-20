-- P33: Manager disable cascade + category delete grace period.
--
-- Two new columns:
--   1. products.cascade_locked: when true (default), the product is
--      included in the manager-disable cascade (status → 'inactive').
--      When false, the product stays active even when its store's
--      manager is disabled. Super Admin only.
--   2. categories.pending_deletion_at: when non-null, the category is
--      scheduled for deletion after the grace period (default 30 days,
--      configurable via settings.category_deletion_grace_days). During
--      the grace period the category can still be reassigned to a
--      store or the deletion can be cancelled.
--
-- Plus a Postgres trigger that BLOCKS hard deletes of categories that
-- are still within the grace window. SA can bypass via the
-- `forceDeleteCategory` action which uses a privileged role to set
-- `pending_deletion_at` to NULL first.

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS cascade_locked BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE public.categories
  ADD COLUMN IF NOT EXISTS pending_deletion_at TIMESTAMPTZ NULL;

-- Partial index for the "show scheduled-for-deletion categories" query
-- on the categories list. Most categories are NOT pending deletion, so
-- a partial index keeps it small.
CREATE INDEX IF NOT EXISTS categories_pending_deletion_idx
  ON public.categories (pending_deletion_at)
  WHERE pending_deletion_at IS NOT NULL;

-- Trigger: prevent hard deletion of a category that is still within
-- its grace period. The grace window is read from the settings table;
-- if the key is missing, fall back to 30 days. Bypassed by
-- forceDeleteCategory (which clears pending_deletion_at first).
CREATE OR REPLACE FUNCTION public.prevent_premature_category_delete()
RETURNS TRIGGER AS $$
DECLARE
  grace_days INT;
BEGIN
  IF OLD.pending_deletion_at IS NULL THEN
    RETURN OLD;  -- not pending deletion, allow
  END IF;

  -- Look up the configured grace period. Default 30 if not set.
  SELECT COALESCE(
    (SELECT (value->>'days')::INT FROM public.settings WHERE key = 'category_deletion_grace_days'),
    30
  ) INTO grace_days;

  -- If the grace period has NOT yet expired, block the delete.
  IF now() < OLD.pending_deletion_at + (grace_days || ' days')::INTERVAL THEN
    RAISE EXCEPTION
      'Category % is pending deletion (scheduled for %). Force delete (which clears pending_deletion_at first) or wait for the grace period to expire.',
      OLD.id, OLD.pending_deletion_at + (grace_days || ' days')::INTERVAL
      USING ERRCODE = 'check_violation';
  END IF;

  -- Grace period has expired; allow the delete.
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_premature_category_delete ON public.categories;
CREATE TRIGGER trg_prevent_premature_category_delete
  BEFORE DELETE ON public.categories
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_premature_category_delete();
