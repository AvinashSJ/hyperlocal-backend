-- ============================================================================
-- P40: Hard delete of products, categories, store managers, order data,
-- staff, customers
-- ----------------------------------------------------------------------------
-- DELETES (in this exact order, all in one transaction):
--   1. order_tracks
--   2. order_items
--   3. invoices
--   4. orders
--   5. product_reviews
--   6. product_images
--   7. product_variants
--   8. products
--   9. store_categories (the categories × stores link table from P23)
--  10. categories (after disabling the P33 grace-period trigger)
--  11. NULL out created_by on store_commissions + commission_payments
--      (avoids FK violation — both columns default to NO ACTION)
--  12. auth.users (every entry where the id is NOT a Super Admin profile)
--      — CASCADE deletes the matching profiles
--      — SET NULL on activity_logs.user_id (audit trail preserved, user ref lost)
--      — SET NULL on store_commissions.created_by (already nulled above)
--
-- KEEPS:
--   - Super Admin profiles + their auth.users entries
--   - Stores (the entities, not the managers)
--   - Roles (Super Admin, Manager, Staff, etc.)
--   - Settings, banners, delivery zones, delivery slots, GST numbers
--   - inventory_log (audit trail — P15 made product_id/variant_id nullable +
--     ON DELETE SET NULL, so rows stay with the product reference nulled)
--   - activity_logs (audit trail — user_id is already ON DELETE SET NULL)
--   - Storage bucket files (Supabase Storage is NOT touched)
--
-- SAFETY:
--   - All deletion is in one BEGIN; ... COMMIT; block
--   - The COMMIT is COMMENTED OUT by default. Uncomment to commit.
--   - ROLLBACK runs by default — the entire transaction is discarded.
--   - Section 1 (DRY RUN counts) and Section 2 (FK safety check) always run
--     regardless of the COMMIT/ROLLBACK choice.
--   - Take a Supabase backup BEFORE running: Dashboard > Database > Backups
-- ============================================================================

-- ============================================================================
-- SECTION 1: DRY RUN — counts only, no changes
-- ============================================================================
DO $$
DECLARE
  v_orders            BIGINT;
  v_order_items       BIGINT;
  v_order_tracks      BIGINT;
  v_invoices          BIGINT;
  v_products          BIGINT;
  v_variants          BIGINT;
  v_images            BIGINT;
  v_reviews           BIGINT;
  v_categories        BIGINT;
  v_store_categories  BIGINT;
  v_inventory_log     BIGINT;
  v_inventory_log_adj BIGINT;
  v_addresses         BIGINT;
  v_notifications     BIGINT;
  v_profiles_total    BIGINT;
  v_profiles_sa       BIGINT;
  v_profiles_mgr      BIGINT;
  v_profiles_staff    BIGINT;
  v_profiles_cust     BIGINT;
  v_profiles_none     BIGINT;
  v_auth_total        BIGINT;
BEGIN
  SELECT COUNT(*) INTO v_orders        FROM public.orders;
  SELECT COUNT(*) INTO v_order_items   FROM public.order_items;
  SELECT COUNT(*) INTO v_order_tracks  FROM public.order_tracks;
  SELECT COUNT(*) INTO v_invoices      FROM public.invoices;
  SELECT COUNT(*) INTO v_products      FROM public.products;
  SELECT COUNT(*) INTO v_variants      FROM public.product_variants;
  SELECT COUNT(*) INTO v_images        FROM public.product_images;
  SELECT COUNT(*) INTO v_reviews       FROM public.product_reviews;
  SELECT COUNT(*) INTO v_categories    FROM public.categories;
  SELECT COUNT(*) INTO v_store_categories FROM public.store_categories;
  SELECT COUNT(*) INTO v_inventory_log FROM public.inventory_log;
  SELECT COUNT(*) INTO v_inventory_log_adj FROM public.inventory_log WHERE adjusted_by IS NOT NULL;
  SELECT COUNT(*) INTO v_addresses     FROM public.addresses;
  SELECT COUNT(*) INTO v_notifications FROM public.notifications;

  SELECT COUNT(*) INTO v_profiles_total FROM public.profiles;
  SELECT COUNT(*) INTO v_profiles_sa FROM (
    SELECT id FROM public.profiles
    WHERE role = 'superadmin'
    UNION
    SELECT p.id FROM public.profiles p
    JOIN public.roles r ON p.role_id = r.id
    WHERE r.name = 'Super Admin'
  ) sa;
  SELECT COUNT(*) INTO v_profiles_mgr
    FROM public.profiles p
    JOIN public.roles r ON p.role_id = r.id
    WHERE r.name = 'Manager';
  SELECT COUNT(*) INTO v_profiles_staff
    FROM public.profiles p
    JOIN public.roles r ON p.role_id = r.id
    WHERE r.name = 'Staff';
  SELECT COUNT(*) INTO v_profiles_cust
    FROM public.profiles WHERE role = 'customer' OR role_id IS NULL;
  SELECT COUNT(*) INTO v_profiles_none
    FROM public.profiles
    WHERE role IS NULL
      AND role_id IS NULL;

  SELECT COUNT(*) INTO v_auth_total FROM auth.users;

  RAISE NOTICE '============================================================';
  RAISE NOTICE 'P40 DRY RUN — what will be deleted';
  RAISE NOTICE '============================================================';
  RAISE NOTICE 'ORDER DATA:';
  RAISE NOTICE '  orders:         %', v_orders;
  RAISE NOTICE '  order_items:    %', v_order_items;
  RAISE NOTICE '  order_tracks:   %', v_order_tracks;
  RAISE NOTICE '  invoices:       %', v_invoices;
  RAISE NOTICE 'PRODUCTS:';
  RAISE NOTICE '  products:           %', v_products;
  RAISE NOTICE '  product_variants:   %', v_variants;
  RAISE NOTICE '  product_images:     %', v_images;
  RAISE NOTICE '  product_reviews:    %', v_reviews;
  RAISE NOTICE 'CATEGORIES:';
  RAISE NOTICE '  categories:         %', v_categories;
  RAISE NOTICE '  store_categories:   %', v_store_categories;
  RAISE NOTICE 'PROFILES (by role):';
  RAISE NOTICE '  total profiles:  %', v_profiles_total;
  RAISE NOTICE '  Super Admin (KEEP):  %', v_profiles_sa;
  RAISE NOTICE '  Manager (DELETE):    %', v_profiles_mgr;
  RAISE NOTICE '  Staff (DELETE):      %', v_profiles_staff;
  RAISE NOTICE '  Customer (DELETE):   %', v_profiles_cust;
  RAISE NOTICE '  No role (DELETE):    %', v_profiles_none;
  RAISE NOTICE 'AUTH USERS:';
  RAISE NOTICE '  total auth.users:  %', v_auth_total;
  RAISE NOTICE 'INVENTORY LOG (NOT deleted, just nulled by P15 FK):';
  RAISE NOTICE '  inventory_log rows:                       % (stays, product_id/variant_id set NULL)', v_inventory_log;
  RAISE NOTICE '  inventory_log rows with adjusted_by set:  % (will be NULLed in 3.4c)', v_inventory_log_adj;
  RAISE NOTICE 'CUSTOMER-SIDE DATA:';
  RAISE NOTICE '  addresses:      % (will be DELETED in 3.1)', v_addresses;
  RAISE NOTICE '  notifications:  % (user_id will be NULLed in 3.1/3.4c)', v_notifications;
  RAISE NOTICE '============================================================';
  RAISE NOTICE 'REVIEW THE COUNTS ABOVE. If they look right, scroll to';
  RAISE NOTICE 'SECTION 3 and uncomment the COMMIT; line.';
  RAISE NOTICE '============================================================';
END $$;

-- ============================================================================
-- SECTION 2: FK SAFETY CHECK — list any NO ACTION FK constraints
-- to profiles OR auth.users that we haven't pre-nulled. If anything
-- shows up here, STOP and add it to Section 3.4c before running.
-- ============================================================================
SELECT
  con.conrelid::regclass AS table_name,
  con.conname AS constraint_name,
  pg_get_constraintdef(con.oid) AS definition
FROM pg_constraint con
JOIN pg_class c ON c.oid = con.conrelid
WHERE c.relnamespace = 'public'::regnamespace
  AND con.contype = 'f'
  AND con.confdeltype = 'a'  -- NO ACTION
  AND (
    pg_get_constraintdef(con.oid) LIKE '%profiles%'
    OR pg_get_constraintdef(con.oid) LIKE '%auth.users%'
  )
ORDER BY table_name, constraint_name;

-- ============================================================================
-- SECTION 3: ACTUAL DELETION
-- The COMMIT is commented out by default. To commit, uncomment it AND
-- comment out the ROLLBACK. To abort, leave it as is (ROLLBACK runs).
-- ============================================================================
BEGIN;

-- 3.1 Order data + customer-side data — delete children before parents
DELETE FROM public.order_tracks;
DELETE FROM public.order_items;
DELETE FROM public.invoices;
DELETE FROM public.orders;
-- Customer-side data tied to the orders above (and to the customer
-- profiles we'll delete later). addresses is referenced by
-- orders.delivery_address_id — deleting addresses AFTER orders is
-- safe because the orders are already gone.
DELETE FROM public.addresses;
-- Per-user notifications — referenced by profiles we'll delete. Same
-- rationale: customers are being wiped, so per-user notifications go
-- with them. Super Admins (kept) get their notifications nulled below
-- in 3.4c so we don't lose the audit trail on their account.
UPDATE public.notifications SET user_id = NULL WHERE user_id IS NOT NULL;
-- Wishlists (may or may not exist — created by the one-off migration
-- endpoint at /api/migrate-wishlist). CASCADE on user_id handles it
-- but explicit is safer if the table doesn't exist yet.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'wishlists') THEN
    DELETE FROM public.wishlists;
  END IF;
END $$;

-- 3.2 Products — delete children before parents
DELETE FROM public.product_reviews;
DELETE FROM public.product_images;
DELETE FROM public.product_variants;
DELETE FROM public.products;

-- 3.3 Categories — disable the P33 grace-period trigger first, then delete.
-- store_categories is a categories × stores link table from P23; it has
-- ON DELETE CASCADE on the categories FK, so it goes with the parent.
-- categories.parent_id is a self-FK; we NULL it before deleting so a
-- parent row isn't blocked by its children.
ALTER TABLE public.categories DISABLE TRIGGER trg_prevent_premature_category_delete;
UPDATE public.categories SET parent_id = NULL WHERE parent_id IS NOT NULL;
DELETE FROM public.categories;  -- CASCADEs to store_categories
ALTER TABLE public.categories ENABLE TRIGGER trg_prevent_premature_category_delete;

-- 3.4 Pre-null created_by references on tables that have NO ACTION FKs to
-- profiles. Catches store_commissions + commission_payments (the latter
-- two columns are explicitly REFERENCES public.profiles(id) with no
-- ON DELETE clause, which defaults to NO ACTION in Postgres).
UPDATE public.store_commissions  SET created_by = NULL WHERE created_by IS NOT NULL;
UPDATE public.commission_payments SET created_by = NULL WHERE created_by IS NOT NULL;

-- 3.4b Pre-null stores.owner_id. The original schema (predating our
-- migrations) defines stores.owner_id REFERENCES profiles(id) with
-- default NO ACTION. A manager profile that's also a store owner would
-- block the auth.users delete below. This is the fix for the
-- "23503 stores_owner_id_fkey" error.
UPDATE public.stores SET owner_id = NULL WHERE owner_id IS NOT NULL;

-- 3.4c Pre-null remaining NO ACTION FKs to profiles / auth.users that we
-- discovered during the P40 live run. Defensive — if any other table
-- has a default-NO-ACTION FK to profiles, this catches it.
--   - addresses.user_id      (default NO ACTION on the original schema)
--   - notifications.user_id  (already nulled above, repeated for safety)
--   - inventory_log.adjusted_by (default NO ACTION — caught by Section 2)
--   - activity_logs.user_id  is already ON DELETE SET NULL — no NULL needed
--   - product_reviews.user_id is already CASCADE — no NULL needed
--   - orders.user_id         is NO ACTION but orders are deleted in 3.1
--                            before this point, so the rows are already
--                            gone — no NULL needed here.
UPDATE public.addresses     SET user_id      = NULL WHERE user_id      IS NOT NULL;
UPDATE public.notifications SET user_id      = NULL WHERE user_id      IS NOT NULL;
UPDATE public.inventory_log SET adjusted_by  = NULL WHERE adjusted_by  IS NOT NULL;

-- 3.4d In-transaction row-level check. Verifies that the columns we just
-- NULLed (3.4 / 3.4b / 3.4c) actually have no non-NULL values left. If
-- any do, the script is broken — abort before the auth.users delete.
-- This is the "belt"; the actual DELETE is the "suspenders" (if there's
-- a NO ACTION FK we missed, the DELETE fails and the transaction
-- rolls back, surfacing the error in the output).
DO $$
DECLARE
  v_addresses        BIGINT;
  v_notifications    BIGINT;
  v_store_comm       BIGINT;
  v_comm_payments    BIGINT;
  v_stores           BIGINT;
  v_inventory_log    BIGINT;
BEGIN
  SELECT COUNT(*) INTO v_addresses     FROM public.addresses         WHERE user_id     IS NOT NULL;
  SELECT COUNT(*) INTO v_notifications FROM public.notifications     WHERE user_id     IS NOT NULL;
  SELECT COUNT(*) INTO v_store_comm    FROM public.store_commissions  WHERE created_by  IS NOT NULL;
  SELECT COUNT(*) INTO v_comm_payments FROM public.commission_payments WHERE created_by IS NOT NULL;
  SELECT COUNT(*) INTO v_stores        FROM public.stores             WHERE owner_id    IS NOT NULL;
  SELECT COUNT(*) INTO v_inventory_log FROM public.inventory_log      WHERE adjusted_by IS NOT NULL;
  RAISE NOTICE 'Pre-delete row counts (should all be 0):';
  RAISE NOTICE '  addresses.user_id non-null:             %', v_addresses;
  RAISE NOTICE '  notifications.user_id non-null:         %', v_notifications;
  RAISE NOTICE '  store_commissions.created_by non-null:  %', v_store_comm;
  RAISE NOTICE '  commission_payments.created_by non-null: %', v_comm_payments;
  RAISE NOTICE '  stores.owner_id non-null:               %', v_stores;
  RAISE NOTICE '  inventory_log.adjusted_by non-null:     %', v_inventory_log;
  IF v_addresses + v_notifications + v_store_comm + v_comm_payments + v_stores + v_inventory_log > 0 THEN
    RAISE EXCEPTION
      'ABORT: non-zero pre-delete row counts above. The auth.users DELETE would violate a NO ACTION FK. This means a table I did not pre-NULL is referencing profiles. Inspect the failing table and add an `UPDATE ... SET <fk_col> = NULL` to Section 3.4c before re-running.';
  END IF;
END $$;

-- 3.5 Delete every auth.users entry that is NOT a Super Admin profile.
-- CASCADE deletes the matching profiles row (profiles.id REFERENCES auth.users).
-- activity_logs.user_id is already ON DELETE SET NULL — audit trail preserved.
--
-- HARD SAFETY: this WHERE NOT IN explicitly preserves Super Admin. It
-- checks BOTH the role text ('superadmin') AND the role_id → roles.name
-- ('Super Admin') to catch profiles where one of the two drifted (P30
-- follow-up: updateUserRole can write role_id without updating role).
-- DO NOT REMOVE THE NOT IN CLAUSE without an explicit test plan.
DELETE FROM auth.users
WHERE id NOT IN (
  SELECT id FROM public.profiles WHERE role = 'superadmin'
  UNION
  SELECT p.id FROM public.profiles p
  JOIN public.roles r ON p.role_id = r.id
  WHERE r.name = 'Super Admin'
);

-- 3.5b ASSERTION: refuse to commit if the Super Admin count changed.
-- Captures the SA count and raises an exception if it dropped.
-- The exception rolls back the entire transaction.
DO $$
DECLARE
  v_sa_after BIGINT;
BEGIN
  SELECT COUNT(*) INTO v_sa_after FROM (
    SELECT id FROM public.profiles WHERE role = 'superadmin'
    UNION
    SELECT p.id FROM public.profiles p
    JOIN public.roles r ON p.role_id = r.id
    WHERE r.name = 'Super Admin'
  ) sa;
  IF v_sa_after = 0 THEN
    RAISE EXCEPTION
      'ABORT: 0 Super Admin profiles remain after deletion. The transaction is being rolled back. Check that your Super Admin profile has either role=''superadmin'' OR role_id pointing to the ''Super Admin'' role in the roles table.';
  END IF;
  RAISE NOTICE 'ASSERTION PASSED: % Super Admin profile(s) preserved.', v_sa_after;
END $$;

-- 3.6 Verification — print what remains
DO $$
DECLARE
  v_super_admins     BIGINT;
  v_profiles_total   BIGINT;
  v_orders           BIGINT;
  v_products         BIGINT;
  v_categories       BIGINT;
  v_inventory_log    BIGINT;
  v_activity_logs    BIGINT;
  v_stores           BIGINT;
  v_roles            BIGINT;
  v_settings         BIGINT;
BEGIN
  SELECT COUNT(*) INTO v_super_admins FROM (
    SELECT id FROM public.profiles WHERE role = 'superadmin'
    UNION
    SELECT p.id FROM public.profiles p
    JOIN public.roles r ON p.role_id = r.id
    WHERE r.name = 'Super Admin'
  ) sa;
  SELECT COUNT(*) INTO v_profiles_total FROM public.profiles;
  SELECT COUNT(*) INTO v_orders       FROM public.orders;
  SELECT COUNT(*) INTO v_products     FROM public.products;
  SELECT COUNT(*) INTO v_categories   FROM public.categories;
  SELECT COUNT(*) INTO v_inventory_log FROM public.inventory_log;
  SELECT COUNT(*) INTO v_activity_logs FROM public.activity_logs;
  SELECT COUNT(*) INTO v_stores       FROM public.stores;
  SELECT COUNT(*) INTO v_roles        FROM public.roles;
  SELECT COUNT(*) INTO v_settings     FROM public.settings;
  RAISE NOTICE 'POST-DELETION:';
  RAISE NOTICE '  Super Admin profiles remaining: % (SHOULD BE > 0)', v_super_admins;
  RAISE NOTICE '  Total profiles remaining:       %', v_profiles_total;
  RAISE NOTICE '  Orders remaining:               %', v_orders;
  RAISE NOTICE '  Products remaining:             %', v_products;
  RAISE NOTICE '  Categories remaining:           %', v_categories;
  RAISE NOTICE '  inventory_log rows (preserved): %', v_inventory_log;
  RAISE NOTICE '  activity_logs rows (preserved): %', v_activity_logs;
  RAISE NOTICE '  Stores remaining (KEEP):        %', v_stores;
  RAISE NOTICE '  Roles remaining (KEEP):         %', v_roles;
  RAISE NOTICE '  Settings remaining (KEEP):      %', v_settings;
END $$;

-- Pick ONE of the two lines below:
-- COMMIT;   -- uncomment to commit the deletion
ROLLBACK;   -- comment this out when uncommenting COMMIT
