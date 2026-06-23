-- ============================================================================
-- P47: Repair orphan Manager profiles whose store_id is NULL or points
-- at a deleted store (P40b aftermath).
-- ----------------------------------------------------------------------------
-- P40b (`20260620000010_p40b_force_delete_stores.sql`) ran:
--   UPDATE public.profiles SET store_id = NULL WHERE store_id IS NOT NULL;
-- ... which broke the store-scoping link for every Manager and Staff.
-- The downstream effect: a Manager logging in has profile.store_id = NULL,
-- getStoreScope() returns { storeId: null, isStoreScoped: false }, and
-- the page actions skip the filter, leaking data across all stores.
--
-- This migration re-links Managers to the most plausible store — the one
-- their products belong to. We use the most recent product they created
-- (DISTINCT ON with ORDER BY created_at DESC). Managers are the only role
-- that creates products per the seed permissions, so this is the
-- highest-signal link.
--
-- Staff are out of scope: they have no `created_by` link (they only
-- `view` + `edit` products, not `create`). The 3 page guards will catch
-- any remaining Staff orphans and redirect them to /unassigned-store.
--
-- Idempotent: only touches profiles that need fixing. Running multiple
-- times is safe.
--
-- Revert: manual UPDATE to set store_id back to NULL or to the original
-- value, per profile. No automatic rollback.
-- ============================================================================

DO $$
DECLARE
  v_fixed   BIGINT := 0;
  v_skipped BIGINT := 0;
BEGIN
  WITH orphaned_managers AS (
    SELECT p.id
    FROM public.profiles p
    JOIN public.roles r ON r.id = p.role_id
    WHERE r.name = 'Manager'
      AND (
        p.store_id IS NULL
        OR NOT EXISTS (SELECT 1 FROM public.stores s WHERE s.id = p.store_id)
      )
  ),
  latest_product_per_manager AS (
    SELECT DISTINCT ON (pr.id) pr.id AS manager_id, prod.store_id
    FROM orphaned_managers om
    JOIN public.profiles pr ON pr.id = om.id
    JOIN public.products prod ON prod.created_by = pr.id
    WHERE prod.store_id IS NOT NULL
      AND EXISTS (SELECT 1 FROM public.stores s WHERE s.id = prod.store_id)
    ORDER BY pr.id, prod.created_at DESC
  ),
  updated AS (
    UPDATE public.profiles p
    SET store_id = lp.store_id,
        updated_at = now()
    FROM latest_product_per_manager lp
    WHERE p.id = lp.manager_id
    RETURNING p.id
  )
  SELECT COUNT(*) INTO v_fixed FROM updated;

  -- Count remaining orphans for visibility. The user (or the Super
  -- Admin) can re-link these via the /users edit form.
  SELECT COUNT(*) INTO v_skipped
  FROM public.profiles p
  JOIN public.roles r ON r.id = p.role_id
  WHERE r.name = 'Manager'
    AND (
      p.store_id IS NULL
      OR NOT EXISTS (SELECT 1 FROM public.stores s WHERE s.id = p.store_id)
    );

  RAISE NOTICE 'P47: Repaired % Manager profiles. % still orphan (manual fix via /users).', v_fixed, v_skipped;
END $$;
