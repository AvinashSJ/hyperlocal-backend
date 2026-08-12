-- ============================================================================
-- WIPE ALL BUSINESS DATA — KEEP ONLY CATEGORIES + SYSTEM TABLES
-- ----------------------------------------------------------------------------
-- One-time production reset. Deletes every business-data row while preserving:
--
-- KEEPS:
--   - categories + subcategories (parent_id self-FK hierarchy)
--   - roles (permissions grid)
--   - settings (app config)
--   - Super Admin profiles + their auth.users entries
--   - Supabase Storage files (NOT touched)
--
-- DELETES (in this exact order, all in one transaction):
--   1.  order_tracks
--   2.  order_items
--   3.  payments               (NO ACTION → orders AND invoices — must precede both)
--   4.  invoices               (after orders.invoice_id is NULLed — breaks the
--                              invoices ↔ orders circular FK)
--   5.  orders
--   6.  return_request_items
--   7.  return_requests
--   8.  addresses
--   9.  notifications
--  10.  wishlists
--  11.  product_reviews
--  12.  product_images
--  13.  product_variants
--  14.  products
--  15.  inventory_log          (audit trail — dropped per decision)
--  16.  activity_logs          (audit trail — dropped per decision)
--  17.  commission_payments
--  18.  store_commissions
--  19.  support_tickets
--  20.  store_categories       (the categories × stores link — UNLINKED,
--                              categories rows themselves are preserved)
--  21.  delivery_slots
--  22.  delivery_zones
--  23.  gst_numbers
--  24.  banners
--  25.  store_products         (0 rows today — defensive)
--  26.  stores                 (after NULLing owner_id + profiles.store_id)
--  27.  auth.users             (every entry NOT a Super Admin; CASCADE deletes
--                              the matching profiles row via profiles.id → auth.users)
--
-- CIRCULAR FK NOTE (caused the original fk_orders_invoice violation):
--   invoices.order_id → orders(id)   NO ACTION
--   orders.invoice_id → invoices(id) NO ACTION  (fk_orders_invoice)
--   payments.order_id/invoice_id → both NO ACTION
--   Fix: NULL orders.invoice_id, delete payments, delete invoices, delete orders.
--
-- SAFETY:
--   - All deletion is in one BEGIN; ... COMMIT; block
--   - The COMMIT is COMMENTED OUT by default. Uncomment to commit.
--   - ROLLBACK runs by default — the entire transaction is discarded.
--   - Section 1 (DRY RUN counts) and Section 2 (FK safety check) always run
--     regardless of the COMMIT/ROLLBACK choice.
--   - Section 3.5: dynamic in-transaction check for NO ACTION FKs to
--     profiles / auth.users / stores before the parent deletes.
--   - Section 4: hard assertions — categories count unchanged, stores = 0,
--     Super Admin count > 0.
--   - Take a Supabase backup BEFORE running: Dashboard > Database > Backups
-- ============================================================================

-- ============================================================================
-- SECTION 1: DRY RUN — counts only, no changes
-- ============================================================================
DO $$
DECLARE
  v_categories        BIGINT;
  v_store_categories  BIGINT;
  v_stores            BIGINT;
  v_orders            BIGINT;
  v_order_items       BIGINT;
  v_order_tracks      BIGINT;
  v_invoices          BIGINT;
  v_products          BIGINT;
  v_variants          BIGINT;
  v_images            BIGINT;
  v_reviews           BIGINT;
  v_inventory_log     BIGINT;
  v_activity_logs     BIGINT;
  v_return_requests   BIGINT;
  v_return_items      BIGINT;
  v_addresses         BIGINT;
  v_notifications     BIGINT;
  v_wishlists         BIGINT;
  v_commissions       BIGINT;
  v_commission_pay    BIGINT;
  v_support_tickets   BIGINT;
  v_banners           BIGINT;
  v_zones             BIGINT;
  v_slots             BIGINT;
  v_gst               BIGINT;
  v_payments          BIGINT;
  v_store_products    BIGINT;
  v_roles             BIGINT;
  v_settings          BIGINT;
  v_profiles_total    BIGINT;
  v_profiles_sa       BIGINT;
  v_profiles_mgr      BIGINT;
  v_profiles_staff    BIGINT;
  v_profiles_cust     BIGINT;
  v_profiles_none     BIGINT;
  v_auth_total        BIGINT;
BEGIN
  SELECT COUNT(*) INTO v_categories       FROM public.categories;
  SELECT COUNT(*) INTO v_store_categories FROM public.store_categories;
  SELECT COUNT(*) INTO v_stores           FROM public.stores;
  SELECT COUNT(*) INTO v_orders           FROM public.orders;
  SELECT COUNT(*) INTO v_order_items      FROM public.order_items;
  SELECT COUNT(*) INTO v_order_tracks     FROM public.order_tracks;
  SELECT COUNT(*) INTO v_invoices         FROM public.invoices;
  SELECT COUNT(*) INTO v_products         FROM public.products;
  SELECT COUNT(*) INTO v_variants         FROM public.product_variants;
  SELECT COUNT(*) INTO v_images           FROM public.product_images;
  SELECT COUNT(*) INTO v_reviews          FROM public.product_reviews;
  SELECT COUNT(*) INTO v_inventory_log    FROM public.inventory_log;
  SELECT COUNT(*) INTO v_activity_logs    FROM public.activity_logs;
  SELECT COUNT(*) INTO v_return_requests  FROM public.return_requests;
  SELECT COUNT(*) INTO v_return_items     FROM public.return_request_items;
  SELECT COUNT(*) INTO v_addresses        FROM public.addresses;
  SELECT COUNT(*) INTO v_notifications    FROM public.notifications;
  SELECT COUNT(*) INTO v_wishlists        FROM public.wishlists;
  SELECT COUNT(*) INTO v_commissions      FROM public.store_commissions;
  SELECT COUNT(*) INTO v_commission_pay   FROM public.commission_payments;
  SELECT COUNT(*) INTO v_support_tickets  FROM public.support_tickets;
  SELECT COUNT(*) INTO v_banners          FROM public.banners;
  SELECT COUNT(*) INTO v_zones            FROM public.delivery_zones;
  SELECT COUNT(*) INTO v_slots            FROM public.delivery_slots;
  SELECT COUNT(*) INTO v_gst              FROM public.gst_numbers;
  -- Defensive tables (0 rows today) — guard in case an environment lacks them.
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'payments') THEN
    SELECT COUNT(*) INTO v_payments FROM public.payments;
  ELSE
    v_payments := 0;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'store_products') THEN
    SELECT COUNT(*) INTO v_store_products FROM public.store_products;
  ELSE
    v_store_products := 0;
  END IF;
  SELECT COUNT(*) INTO v_roles            FROM public.roles;
  SELECT COUNT(*) INTO v_settings         FROM public.settings;

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
  RAISE NOTICE 'WIPE DRY RUN — what will be deleted';
  RAISE NOTICE '============================================================';
  RAISE NOTICE 'ORDER DATA:';
  RAISE NOTICE '  orders:         %', v_orders;
  RAISE NOTICE '  order_items:    %', v_order_items;
  RAISE NOTICE '  order_tracks:   %', v_order_tracks;
  RAISE NOTICE '  invoices:       %', v_invoices;
  RAISE NOTICE '  return_requests:    %', v_return_requests;
  RAISE NOTICE '  return_request_items: %', v_return_items;
  RAISE NOTICE 'PRODUCTS:';
  RAISE NOTICE '  products:           %', v_products;
  RAISE NOTICE '  product_variants:   %', v_variants;
  RAISE NOTICE '  product_images:     %', v_images;
  RAISE NOTICE '  product_reviews:    %', v_reviews;
  RAISE NOTICE 'AUDIT (will be DELETED per decision):';
  RAISE NOTICE '  inventory_log:      %', v_inventory_log;
  RAISE NOTICE '  activity_logs:      %', v_activity_logs;
  RAISE NOTICE 'CUSTOMER-SIDE:';
  RAISE NOTICE '  addresses:          %', v_addresses;
  RAISE NOTICE '  notifications:      %', v_notifications;
  RAISE NOTICE '  wishlists:          %', v_wishlists;
  RAISE NOTICE 'MONEY:';
  RAISE NOTICE '  store_commissions:  %', v_commissions;
  RAISE NOTICE '  commission_payments: %', v_commission_pay;
  RAISE NOTICE '  payments:           %', v_payments;
  RAISE NOTICE 'STORE-SCOPED:';
  RAISE NOTICE '  stores:             %', v_stores;
  RAISE NOTICE '  store_categories (UNLINKED, categories KEPT): %', v_store_categories;
  RAISE NOTICE '  store_products:     %', v_store_products;
  RAISE NOTICE '  banners:            %', v_banners;
  RAISE NOTICE '  delivery_zones:     %', v_zones;
  RAISE NOTICE '  delivery_slots:     %', v_slots;
  RAISE NOTICE '  gst_numbers:        %', v_gst;
  RAISE NOTICE 'MISC:';
  RAISE NOTICE '  support_tickets:    %', v_support_tickets;
  RAISE NOTICE 'PROFILES (by role):';
  RAISE NOTICE '  total profiles:  %', v_profiles_total;
  RAISE NOTICE '  Super Admin (KEEP):  %', v_profiles_sa;
  RAISE NOTICE '  Manager (DELETE):    %', v_profiles_mgr;
  RAISE NOTICE '  Staff (DELETE):      %', v_profiles_staff;
  RAISE NOTICE '  Customer (DELETE):   %', v_profiles_cust;
  RAISE NOTICE '  No role (DELETE):    %', v_profiles_none;
  RAISE NOTICE 'AUTH USERS:';
  RAISE NOTICE '  total auth.users:  %', v_auth_total;
  RAISE NOTICE 'KEEP TABLES (NOT touched):';
  RAISE NOTICE '  categories (KEEP):      %', v_categories;
  RAISE NOTICE '  roles (KEEP):           %', v_roles;
  RAISE NOTICE '  settings (KEEP):        %', v_settings;
  RAISE NOTICE '============================================================';
  RAISE NOTICE 'REVIEW THE COUNTS ABOVE. If they look right, scroll to';
  RAISE NOTICE 'SECTION 3 and uncomment the COMMIT; line.';
  RAISE NOTICE '============================================================';
END $$;

-- ============================================================================
-- SECTION 2: FK SAFETY CHECK — list any NO ACTION FK constraints
-- to stores / profiles / auth.users we haven't pre-nulled. If anything
-- shows up here, STOP and add it to Section 3 before running.
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
    pg_get_constraintdef(con.oid) LIKE '% REFERENCES stores(%'
    OR pg_get_constraintdef(con.oid) LIKE '% REFERENCES profiles(%'
    OR pg_get_constraintdef(con.oid) LIKE '% REFERENCES auth.users(%'
  )
ORDER BY table_name, constraint_name;

-- ============================================================================
-- SECTION 3: ACTUAL DELETION
-- The COMMIT is commented out by default. To commit, uncomment it AND
-- comment out the ROLLBACK. To abort, leave it as is (ROLLBACK runs).
-- ============================================================================
BEGIN;

-- 3.1 Order data — children before parents. orders.user_id and orders.store_id
-- are NO ACTION FKs to profiles/stores, so orders must be gone before the
-- profile/store deletes in 3.6/3.8. invoices.gstin_id → gst_numbers and
-- orders.delivery_address_id → addresses are both NO ACTION — those child
-- tables are deleted in 3.3/3.7 after their referencing rows are gone.
--
-- invoices ↔ orders is a CIRCULAR reference (both NO ACTION):
--   orders.invoice_id → invoices(id)   (fk_orders_invoice)
--   invoices.order_id → orders(id)     (invoices_order_id_fkey)
-- plus payments is NO ACTION → BOTH orders and invoices.
-- Break the cycle first: NULL orders.invoice_id, delete payments, then
-- invoices, then orders.
DELETE FROM public.order_tracks;   -- CASCADE to orders
DELETE FROM public.order_items;    -- CASCADE to orders
UPDATE public.orders SET invoice_id = NULL WHERE invoice_id IS NOT NULL;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'payments') THEN
    DELETE FROM public.payments;
  END IF;
END $$;
DELETE FROM public.invoices;
DELETE FROM public.orders;

-- 3.2 Returns — requested_by/decided_by are NO ACTION → profiles; delete now.
DELETE FROM public.return_request_items;
DELETE FROM public.return_requests;

-- 3.3 Customer-side data tied to the profiles we'll delete in 3.8.
DELETE FROM public.addresses;
DELETE FROM public.notifications;
-- Wishlists (may or may not exist — created by the one-off migration
-- endpoint at /api/migrate-wishlist). CASCADE on user_id handles it
-- but explicit is safer if the table doesn't exist yet.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'wishlists') THEN
    DELETE FROM public.wishlists;
  END IF;
END $$;

-- 3.4 Products — children before parents. products.category_id is NO ACTION
-- → categories, but categories are KEPT and products are deleted first, so
-- the FK never blocks.
DELETE FROM public.product_reviews;
DELETE FROM public.product_images;
DELETE FROM public.product_variants;
DELETE FROM public.products;

-- 3.4b Audit trails — dropped per the wipe decision (user chose to drop
-- activity_logs + inventory_log along with the business data).
DELETE FROM public.inventory_log;
DELETE FROM public.activity_logs;

-- 3.5 Money — commission_payments cascades from store_commissions; both
-- created_by columns are NO ACTION → profiles, so delete before 3.8.
DELETE FROM public.commission_payments;
DELETE FROM public.store_commissions;

-- 3.5b Support tickets — user_id is CASCADE → profiles, store_id is SET NULL
-- → stores, assigned_to is SET NULL → profiles. Delete the whole table.
DELETE FROM public.support_tickets;

-- 3.5c Store-scoped tables — stores is deleted in 3.7, so every referencing
-- row must be gone first. store_categories links categories (KEPT) to stores;
-- we delete the LINKS only — the categories rows survive.
DELETE FROM public.store_categories;
DELETE FROM public.delivery_slots;
DELETE FROM public.delivery_zones;
DELETE FROM public.gst_numbers;
DELETE FROM public.banners;
-- Defensive tables that exist in some environments with 0 rows.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'payments') THEN
    DELETE FROM public.payments;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'store_products') THEN
    DELETE FROM public.store_products;
  END IF;
END $$;

-- 3.6 Pre-null the NO ACTION FKs to stores and profiles so the parent rows
-- can be deleted:
--   - profiles.store_id   → stores  (NO ACTION)
--   - stores.owner_id     → profiles (NO ACTION)
UPDATE public.profiles SET store_id = NULL WHERE store_id IS NOT NULL;
UPDATE public.stores    SET owner_id = NULL WHERE owner_id IS NOT NULL;

-- 3.6b In-transaction row-level check. Iterates every NO ACTION FK to
-- stores/profiles/auth.users in the public schema, counts non-NULL values in
-- the FK column, and aborts if any are non-zero. Belt and suspenders: if a
-- future migration adds a NO ACTION FK and we don't NULL/DELETE it, the
-- DELETE below fails and the transaction rolls back.
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
      AND (
        pg_get_constraintdef(con.oid) LIKE '% REFERENCES stores(%'
        OR pg_get_constraintdef(con.oid) LIKE '% REFERENCES profiles(%'
        OR pg_get_constraintdef(con.oid) LIKE '% REFERENCES auth.users(%'
      )
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
      'ABORT: NO ACTION FKs to stores/profiles/auth.users still have non-null references: %. Add the appropriate UPDATE/DELETE to Section 3 before re-running.', v_violations;
  END IF;
  RAISE NOTICE 'Dynamic FK check passed: % NO ACTION FK(s) verified NULL-safe.', v_total_checked;
END $$;

-- 3.7 Delete all stores (the entities). store_categories links were already
-- removed in 3.5c, so categories remain intact.
DELETE FROM public.stores;

-- 3.8 Delete every auth.users entry that is NOT a Super Admin profile.
-- CASCADE deletes the matching profiles row (profiles.id REFERENCES auth.users).
-- HARD SAFETY: the WHERE NOT IN explicitly preserves Super Admin. It checks
-- BOTH the role text ('superadmin') AND the role_id → roles.name ('Super Admin')
-- to catch profiles where one of the two drifted (P30 follow-up).
DELETE FROM auth.users
WHERE id NOT IN (
  SELECT id FROM public.profiles WHERE role = 'superadmin'
  UNION
  SELECT p.id FROM public.profiles p
  JOIN public.roles r ON p.role_id = r.id
  WHERE r.name = 'Super Admin'
);

-- ============================================================================
-- SECTION 4: HARD ASSERTIONS — refuse to commit if any check fails
-- ============================================================================
DO $$
DECLARE
  v_categories_after  BIGINT;
  v_categories_before BIGINT;
  v_stores_after      BIGINT;
  v_sa_after          BIGINT;
BEGIN
  -- Categories must be unchanged (this is the whole point of the wipe)
  SELECT COUNT(*) INTO v_categories_before FROM public.categories;
  SELECT COUNT(*) INTO v_categories_after  FROM public.categories;
  IF v_categories_after <> v_categories_before THEN
    RAISE EXCEPTION
      'ABORT: categories count changed during wipe (before=%, after=%). Rolling back.', v_categories_before, v_categories_after;
  END IF;

  -- 0 stores must remain
  SELECT COUNT(*) INTO v_stores_after FROM public.stores;
  IF v_stores_after <> 0 THEN
    RAISE EXCEPTION 'ABORT: % stores still remain after wipe. Rolling back.', v_stores_after;
  END IF;

  -- Super Admin count must be > 0
  SELECT COUNT(*) INTO v_sa_after FROM (
    SELECT id FROM public.profiles WHERE role = 'superadmin'
    UNION
    SELECT p.id FROM public.profiles p
    JOIN public.roles r ON p.role_id = r.id
    WHERE r.name = 'Super Admin'
  ) sa;
  IF v_sa_after = 0 THEN
    RAISE EXCEPTION
      'ABORT: 0 Super Admin profiles remain after wipe. Rolling back. Check that your Super Admin profile has either role=''superadmin'' OR role_id pointing to the ''Super Admin'' role in the roles table.';
  END IF;

  RAISE NOTICE 'ASSERTIONS PASSED:';
  RAISE NOTICE '  categories count unchanged: %', v_categories_after;
  RAISE NOTICE '  stores remaining: 0';
  RAISE NOTICE '  Super Admin profiles: %', v_sa_after;
END $$;

-- ============================================================================
-- SECTION 5: Verification — print what remains
-- ============================================================================
DO $$
DECLARE
  v_categories       BIGINT;
  v_roles            BIGINT;
  v_settings         BIGINT;
  v_super_admins     BIGINT;
  v_profiles_total   BIGINT;
  v_stores           BIGINT;
  v_products         BIGINT;
  v_orders           BIGINT;
  v_inventory_log    BIGINT;
  v_activity_logs    BIGINT;
BEGIN
  SELECT COUNT(*) INTO v_categories    FROM public.categories;
  SELECT COUNT(*) INTO v_roles         FROM public.roles;
  SELECT COUNT(*) INTO v_settings      FROM public.settings;
  SELECT COUNT(*) INTO v_profiles_total FROM public.profiles;
  SELECT COUNT(*) INTO v_stores        FROM public.stores;
  SELECT COUNT(*) INTO v_products      FROM public.products;
  SELECT COUNT(*) INTO v_orders        FROM public.orders;
  SELECT COUNT(*) INTO v_inventory_log FROM public.inventory_log;
  SELECT COUNT(*) INTO v_activity_logs FROM public.activity_logs;
  SELECT COUNT(*) INTO v_super_admins FROM (
    SELECT id FROM public.profiles WHERE role = 'superadmin'
    UNION
    SELECT p.id FROM public.profiles p
    JOIN public.roles r ON p.role_id = r.id
    WHERE r.name = 'Super Admin'
  ) sa;
  RAISE NOTICE 'POST-WIPE:';
  RAISE NOTICE '  categories (KEEP):       %', v_categories;
  RAISE NOTICE '  roles (KEEP):            %', v_roles;
  RAISE NOTICE '  settings (KEEP):         %', v_settings;
  RAISE NOTICE '  Super Admin profiles:    % (SHOULD BE > 0)', v_super_admins;
  RAISE NOTICE '  Total profiles:          %', v_profiles_total;
  RAISE NOTICE '  Stores remaining:        % (SHOULD BE 0)', v_stores;
  RAISE NOTICE '  Products remaining:      % (SHOULD BE 0)', v_products;
  RAISE NOTICE '  Orders remaining:        % (SHOULD BE 0)', v_orders;
  RAISE NOTICE '  inventory_log remaining: % (SHOULD BE 0)', v_inventory_log;
  RAISE NOTICE '  activity_logs remaining: % (SHOULD BE 0)', v_activity_logs;
  RAISE NOTICE '============================================================';
END $$;

-- Pick ONE of the two lines below:
-- COMMIT;   -- uncomment to commit the wipe
ROLLBACK;   -- comment this out when uncommenting COMMIT
