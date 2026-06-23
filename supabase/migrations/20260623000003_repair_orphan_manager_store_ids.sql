-- ============================================================================
-- P47: Report orphan Manager profiles (profile.store_id is NULL or
-- points at a deleted store) and provide a manual-fix recipe.
-- ----------------------------------------------------------------------------
-- P40b (`20260620000010_p40b_force_delete_stores.sql`) ran:
--   UPDATE public.profiles SET store_id = NULL WHERE store_id IS NOT NULL;
-- ... which broke the link from every Manager and Staff profile to its
-- store.
--
-- A previous version of this migration tried to auto-link orphan Managers
-- via `products.created_by`. That column does not exist on the products
-- table (the products schema was created outside this migration set, and
-- the only "who created this" signal is `store_id` on the product itself).
-- P40 + P40b also nulled every other `user_id` reference (activity_logs,
-- addresses, notifications) and CASCADE-deleted the auth.users rows that
-- owned them, so no reliable "who managed what" signal survives in the
-- current schema.
--
-- This migration therefore only REPORTS the orphan Managers. The
-- fix itself is a manual UPDATE per row. Use the existing /users edit
-- form (Super Admin role only) for the canonical workflow; the helper
-- queries below are provided for one-off SQL operations.
--
-- The P47 read-side guard (see `src/lib/store-scope.ts` and the 3 page
-- files in /orders, /customers, /invoices) catches the user-facing
-- symptom: orphan Managers are now redirected to /unassigned-store
-- with a clear "contact Super Admin" message instead of seeing an
-- empty list or a silent data leak.
--
-- Idempotent: this migration is a read-only report. It does not write
-- to any table. Running it multiple times is safe and cheap.
-- ============================================================================

DO $$
DECLARE
  v_orphans BIGINT := 0;
  v_total_managers BIGINT := 0;
  v_total_staff BIGINT := 0;
  v_total_stores BIGINT := 0;
BEGIN
  -- Total counts for context
  SELECT COUNT(*) INTO v_total_managers FROM public.profiles p JOIN public.roles r ON r.id = p.role_id WHERE r.name = 'Manager';
  SELECT COUNT(*) INTO v_total_staff    FROM public.profiles p JOIN public.roles r ON r.id = p.role_id WHERE r.name = 'Staff';
  SELECT COUNT(*) INTO v_total_stores  FROM public.stores;

  -- Count orphan Managers: store_id is NULL OR references a store that no longer exists.
  SELECT COUNT(*) INTO v_orphans
  FROM public.profiles p
  JOIN public.roles r ON r.id = p.role_id
  WHERE r.name = 'Manager'
    AND (
      p.store_id IS NULL
      OR NOT EXISTS (SELECT 1 FROM public.stores s WHERE s.id = p.store_id)
    );

  RAISE NOTICE 'P47: Found % orphan Manager profile(s) (out of % total Managers). % staff, % store(s) total.', v_orphans, v_total_managers, v_total_staff, v_total_stores;

  IF v_orphans > 0 THEN
    RAISE NOTICE 'P47: Run the per-profile UPDATE below to link each orphan to the correct store. Replace <store_uuid> with the real store id from `SELECT id, name FROM public.stores;`.';
  END IF;
END $$;

-- List the orphans. This is a SELECT, not an UPDATE, so it is safe to run.
-- The result is what Super Admin needs to make the fix decision.
SELECT
  p.id              AS profile_id,
  p.full_name,
  p.email,
  p.phone,
  p.store_id        AS current_store_id,
  p.is_active,
  r.name            AS role_name,
  p.updated_at
FROM public.profiles p
JOIN public.roles r ON r.id = p.role_id
WHERE r.name IN ('Manager', 'Staff')
  AND (
    p.store_id IS NULL
    OR NOT EXISTS (SELECT 1 FROM public.stores s WHERE s.id = p.store_id)
  )
ORDER BY r.name, p.full_name;

-- ----------------------------------------------------------------------------
-- MANUAL FIX RECIPE (run AFTER reviewing the SELECT above)
-- ----------------------------------------------------------------------------
--
-- 1. List the available stores:
--      SELECT id, name, code FROM public.stores ORDER BY name;
--
-- 2. For each orphan Manager, decide which store they belong to. Run:
--
--      UPDATE public.profiles
--      SET    store_id = '<store_uuid_from_step_1>',
--             updated_at = now()
--      WHERE  id = '<profile_id_from_the_SELECT_above>';
--
-- 3. Verify the fix:
--      SELECT p.id, p.full_name, p.store_id, s.name AS store_name
--      FROM   public.profiles p
--      LEFT JOIN public.stores s ON s.id = p.store_id
--      WHERE  p.id = '<profile_id>';
--
-- 4. The next time the Manager logs in, getStoreScope() returns the
--    correct store_id and /orders, /customers, /invoices show their data.
-- ----------------------------------------------------------------------------
