-- ============================================================================
-- P40b: Force-delete all stores (P40 follow-up)
-- ----------------------------------------------------------------------------
-- DELETES (in this exact order, all in one transaction):
--   1. profiles.store_id = NULL   (breaks the link from any profile to its
--                                  store; the profile ROWs stay)
--   2. banners.store_id = NULL    (orphan the banners to a no-store state)
--   3. delivery_zones.store_id = NULL  (same)
--   4. gst_numbers.store_id = NULL     (same)
--   5. delivery_slots               (whole table — all become orphans since
--                                    their zones no longer have a store)
--   6. store_commissions            (whole table — all store-scoped rows)
--   7. stores                       (parent rows)
--
-- KEEPS:
--   - Super Admin profile + auth.users entries
--   - Other profiles whose role is NULL (e.g. orphaned customers from P40)
--   - Roles (Super Admin, Manager, Staff)
--   - Settings
--   - Banners (rows kept, store_id NULLed)
--   - delivery_zones (rows kept, store_id NULLed)
--   - gst_numbers (rows kept, store_id NULLed)
--   - inventory_log (P15 SET NULL — product_id/variant_id already nulled by P40)
--   - activity_logs (P25 — user_id already nulled by P40)
--   - Supabase Storage files (not touched)
--   NOTE: storemanager@test.com was already deleted by P40 (Manager role,
--   not Super Admin). The user said it can be left out — no assertion on it.
--
-- SAFETY:
--   - Single BEGIN; ... COMMIT; transaction
--   - COMMIT commented out by default; uncomment to commit
--   - ROLLBACK runs by default — entire transaction is discarded
--   - Section 1: dry-run counts via RAISE NOTICE
--   - Section 2: dynamic FK discovery (lists every NO ACTION FK to stores)
--   - Section 3.4d: dynamic in-transaction check before the DELETE
--   - Section 3.5: hard assertions
--       - 0 stores after delete
--       - Super Admin count > 0
--   - Take a Supabase backup BEFORE running: Dashboard > Database > Backups
-- ============================================================================

-- ============================================================================
-- SECTION 1: DRY RUN — counts only, no changes
-- ============================================================================
DO $$
DECLARE
  v_stores              BIGINT;
  v_profiles_with_store BIGINT;
  v_banners_with_store  BIGINT;
  v_zones_with_store    BIGINT;
  v_gst_with_store      BIGINT;
  v_slots_total         BIGINT;
  v_commissions_total   BIGINT;
  v_sa_count            BIGINT;
  v_profiles_total      BIGINT;
BEGIN
  SELECT COUNT(*) INTO v_stores              FROM public.stores;
  SELECT COUNT(*) INTO v_profiles_with_store FROM public.profiles       WHERE store_id IS NOT NULL;
  SELECT COUNT(*) INTO v_banners_with_store  FROM public.banners         WHERE store_id IS NOT NULL;
  SELECT COUNT(*) INTO v_zones_with_store    FROM public.delivery_zones  WHERE store_id IS NOT NULL;
  SELECT COUNT(*) INTO v_gst_with_store      FROM public.gst_numbers     WHERE store_id IS NOT NULL;
  SELECT COUNT(*) INTO v_slots_total         FROM public.delivery_slots;
  SELECT COUNT(*) INTO v_commissions_total   FROM public.store_commissions;
  SELECT COUNT(*) INTO v_sa_count FROM (
    SELECT id FROM public.profiles WHERE role = 'superadmin'
    UNION
    SELECT p.id FROM public.profiles p
    JOIN public.roles r ON p.role_id = r.id
    WHERE r.name = 'Super Admin'
  ) sa;
  SELECT COUNT(*) INTO v_profiles_total FROM public.profiles;

  RAISE NOTICE '============================================================';
  RAISE NOTICE 'P40b DRY RUN — what will be deleted';
  RAISE NOTICE '============================================================';
  RAISE NOTICE 'STORES:';
  RAISE NOTICE '  stores:                                % (will be DELETED)', v_stores;
  RAISE NOTICE 'CHILD FK COLUMNS (will be NULLed):';
  RAISE NOTICE '  profiles with store_id NOT NULL:      %', v_profiles_with_store;
  RAISE NOTICE '  banners with store_id NOT NULL:       %', v_banners_with_store;
  RAISE NOTICE '  delivery_zones with store_id NOT NULL: %', v_zones_with_store;
  RAISE NOTICE '  gst_numbers with store_id NOT NULL:   %', v_gst_with_store;
  RAISE NOTICE 'CHILD TABLES (will be DELETED whole):';
  RAISE NOTICE '  delivery_slots (whole table):         % rows', v_slots_total;
  RAISE NOTICE '  store_commissions (whole table):      % rows', v_commissions_total;
  RAISE NOTICE 'KEEP CHECKS:';
  RAISE NOTICE '  Super Admin profiles (KEEP):          % (must be > 0)', v_sa_count;
  RAISE NOTICE '  Total profiles remaining after NULLs: %', v_profiles_total;
  RAISE NOTICE '============================================================';
  RAISE NOTICE 'REVIEW THE COUNTS ABOVE. If they look right, scroll to';
  RAISE NOTICE 'SECTION 3 and uncomment the COMMIT; line.';
  RAISE NOTICE '============================================================';
END $$;

-- ============================================================================
-- SECTION 2: FK SAFETY CHECK (DYNAMIC)
-- Lists every NO ACTION FK to public.stores in the public schema. If
-- anything shows up here that Section 3 doesn't handle, STOP and add
-- an explicit NULL-out or DELETE.
-- ============================================================================
SELECT
  con.conrelid::regclass::text AS table_name,
  con.conname                 AS constraint_name,
  (SELECT a.attname
     FROM unnest(con.conkey) AS ak
     JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = ak
     LIMIT 1)               AS fk_column
FROM pg_constraint con
JOIN pg_class c ON c.oid = con.conrelid
WHERE c.relnamespace = 'public'::regnamespace
  AND con.contype = 'f'
  AND con.confdeltype = 'a'  -- NO ACTION
  AND pg_get_constraintdef(con.oid) LIKE '%stores%'
ORDER BY table_name, constraint_name;

-- ============================================================================
-- SECTION 3: ACTUAL DELETION
-- The COMMIT is commented out by default. To commit, uncomment it AND
-- comment out the ROLLBACK. To abort, leave as is (ROLLBACK runs).
-- ============================================================================
BEGIN;

-- 3.1 NULL out profiles.store_id. Any profile linked to a store has
-- its store_id cleared (the profile ROW stays; only the link is
-- broken so the store can be deleted).
UPDATE public.profiles       SET store_id = NULL WHERE store_id IS NOT NULL;

-- 3.2 NULL out other child FKs to stores. The rows themselves stay
-- (per "KEEPS" above); they just lose the store reference.
-- delivery_slots is also NULLed here as a belt-and-suspenders even
-- though 3.3 deletes the whole table — covers future schema changes
-- where 3.3 might be conditional.
UPDATE public.banners        SET store_id = NULL WHERE store_id IS NOT NULL;
UPDATE public.delivery_zones SET store_id = NULL WHERE store_id IS NOT NULL;
UPDATE public.gst_numbers    SET store_id = NULL WHERE store_id IS NOT NULL;
UPDATE public.delivery_slots SET store_id = NULL WHERE store_id IS NOT NULL;

-- 3.3 Delete child tables that are fully orphaned by the NULLs above.
-- delivery_slots references delivery_zones; once a zone has no store
-- the slot is meaningless. Same for store_commissions.
DELETE FROM public.delivery_slots;
DELETE FROM public.store_commissions;

-- 3.4 Dynamic in-transaction check. Same pattern as P40 3.4d but for
-- stores. Iterates every NO ACTION FK to public.stores, counts non-NULL
-- rows in the FK column, aborts if any are non-zero. Belt-and-suspenders:
-- if a future migration adds a new FK and we don't NULL it, the actual
-- DELETE will fail and the transaction will roll back.
DO $$
DECLARE
  v_rec RECORD;
  v_count BIGINT;
  v_violations TEXT := '';
  v_total_checked INT := 0;
BEGIN
  FOR v_rec IN
    SELECT
      con.conrelid::regclass::text AS table_name,
      (SELECT a.attname
         FROM unnest(con.conkey) AS ak
         JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = ak
         LIMIT 1) AS fk_column
    FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    WHERE c.relnamespace = 'public'::regnamespace
      AND con.contype = 'f'
      AND con.confdeltype = 'a'  -- NO ACTION
      AND pg_get_constraintdef(con.oid) LIKE '%stores%'
  LOOP
    v_total_checked := v_total_checked + 1;
    IF v_rec.fk_column IS NOT NULL THEN
      EXECUTE format('SELECT COUNT(*) FROM %I WHERE %I IS NOT NULL', v_rec.table_name, v_rec.fk_column)
        INTO v_count;
      IF v_count > 0 THEN
        v_violations := v_violations || format('%s.%s=%s rows; ', v_rec.table_name, v_rec.fk_column, v_count);
      END IF;
    END IF;
  END LOOP;
  IF length(v_violations) > 0 THEN
    RAISE EXCEPTION
      'ABORT: NO ACTION FKs to public.stores still have non-null references: %. Add the appropriate UPDATE/DELETE to Section 3 before re-running.', v_violations;
  END IF;
  RAISE NOTICE 'Dynamic FK check passed: % NO ACTION FK(s) to public.stores verified NULL-safe.', v_total_checked;
END $$;

-- 3.5 Force-delete all stores. No trigger to disable (only the P33
-- categories trigger was special).
DELETE FROM public.stores;

-- 3.6 Hard assertions. The transaction rolls back on stores count
-- and Super Admin count only. (storemanager@test.com is no longer
-- asserted — it was deleted by P40 and the user said it can be
-- left out.)
DO $$
DECLARE
  v_stores        BIGINT;
  v_sa_count      BIGINT;
BEGIN
  -- 0 stores must remain (HARD assertion)
  SELECT COUNT(*) INTO v_stores FROM public.stores;
  IF v_stores <> 0 THEN
    RAISE EXCEPTION 'ABORT: % stores still remain after delete. Rolling back.', v_stores;
  END IF;

  -- Super Admin must still exist (HARD assertion)
  SELECT COUNT(*) INTO v_sa_count FROM (
    SELECT id FROM public.profiles WHERE role = 'superadmin'
    UNION
    SELECT p.id FROM public.profiles p
    JOIN public.roles r ON p.role_id = r.id
    WHERE r.name = 'Super Admin'
  ) sa;
  IF v_sa_count = 0 THEN
    RAISE EXCEPTION 'ABORT: 0 Super Admin profiles remain. Rolling back.';
  END IF;

  RAISE NOTICE 'ASSERTION PASSED:';
  RAISE NOTICE '  stores remaining: 0';
  RAISE NOTICE '  Super Admin profiles: %', v_sa_count;
END $$;

-- 3.7 Verification — print what remains
DO $$
DECLARE
  v_stores         BIGINT;
  v_profiles_total BIGINT;
  v_banners        BIGINT;
  v_zones          BIGINT;
  v_gst            BIGINT;
  v_slots          BIGINT;
  v_commissions    BIGINT;
  v_inventory_log  BIGINT;
  v_activity_logs  BIGINT;
  v_stores_kept    BIGINT;
  v_sa_final       BIGINT;
BEGIN
  SELECT COUNT(*) INTO v_stores         FROM public.stores;
  SELECT COUNT(*) INTO v_profiles_total FROM public.profiles;
  SELECT COUNT(*) INTO v_banners        FROM public.banners;
  SELECT COUNT(*) INTO v_zones          FROM public.delivery_zones;
  SELECT COUNT(*) INTO v_gst            FROM public.gst_numbers;
  SELECT COUNT(*) INTO v_slots          FROM public.delivery_slots;
  SELECT COUNT(*) INTO v_commissions    FROM public.store_commissions;
  SELECT COUNT(*) INTO v_inventory_log  FROM public.inventory_log;
  SELECT COUNT(*) INTO v_activity_logs  FROM public.activity_logs;
  SELECT COUNT(*) INTO v_stores_kept    FROM public.profiles WHERE store_id IS NOT NULL;
  SELECT COUNT(*) INTO v_sa_final FROM (
    SELECT id FROM public.profiles WHERE role = 'superadmin'
    UNION
    SELECT p.id FROM public.profiles p
    JOIN public.roles r ON p.role_id = r.id
    WHERE r.name = 'Super Admin'
  ) sa;

  RAISE NOTICE '============================================================';
  RAISE NOTICE 'POST-DELETION (P40b):';
  RAISE NOTICE '============================================================';
  RAISE NOTICE '  stores remaining:                       0 (target)';
  RAISE NOTICE '  delivery_slots remaining:              0 (target)';
  RAISE NOTICE '  store_commissions remaining:           0 (target)';
  RAISE NOTICE '  profiles with non-NULL store_id:       % (target: 0)', v_stores_kept;
  RAISE NOTICE '  Super Admin profiles:                  % (target: >= 1)', v_sa_final;
  RAISE NOTICE '  total profiles remaining:              %', v_profiles_total;
  RAISE NOTICE 'KEEPS (rows preserved, references NULLed):';
  RAISE NOTICE '  banners:           %', v_banners;
  RAISE NOTICE '  delivery_zones:    %', v_zones;
  RAISE NOTICE '  gst_numbers:       %', v_gst;
  RAISE NOTICE '  inventory_log:     % (preserved)', v_inventory_log;
  RAISE NOTICE '  activity_logs:     % (preserved)', v_activity_logs;
  RAISE NOTICE '============================================================';
END $$;

-- Pick ONE of the two lines below:
-- COMMIT;   -- uncomment to commit the deletion
ROLLBACK;   -- comment this out when uncommenting COMMIT
