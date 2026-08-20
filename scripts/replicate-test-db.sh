#!/usr/bin/env bash
# Replicates business data from the PROD database into the TEST database.
#
# Strategy: prod -> TEST is data-only (the test schema is bootstrapped from a
# full prod schema dump; see the setup notes in the workflow). auth.users rows
# are copied too so public-table FKs to auth.users stay valid, but all
# credentials are blanked on test (passwords/tokens removed, identities,
# sessions and refresh tokens deleted) so no real user secrets ever land on test.
#
# Env required:
#   PROD_DB_URL  - libpq connection string for prod
#   TEST_DB_URL  - libpq connection string for test
set -euo pipefail

: "${PROD_DB_URL:?PROD_DB_URL is required}"
: "${TEST_DB_URL:?TEST_DB_URL is required}"

PUBLIC_DATA="$(mktemp)"
AUTH_USERS="$(mktemp)"
trap 'rm -f "$PUBLIC_DATA" "$AUTH_USERS"' EXIT

echo ">> Dumping prod business data..."
pg_dump "$PROD_DB_URL" --data-only --no-owner \
  --schema public \
  --exclude-table=public.spatial_ref_sys \
  --file "$PUBLIC_DATA"
pg_dump "$PROD_DB_URL" --data-only --no-owner \
  -t auth.users \
  --file "$AUTH_USERS"

echo ">> Truncating test tables..."
psql "$TEST_DB_URL" -v ON_ERROR_STOP=1 --single-transaction -q <<'SQL'
TRUNCATE auth.users CASCADE;
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT schemaname, tablename
    FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename <> 'spatial_ref_sys'
    ORDER BY tablename
  LOOP
    EXECUTE format('TRUNCATE %I.%I CASCADE', r.schemaname, r.tablename);
  END LOOP;
END $$;
SQL

echo ">> Loading auth.users..."
# session_replication_role=replica turns off FK checks and triggers for the
# whole load. Needed because prod has circular FKs (profiles<->stores,
# orders<->invoices, categories) that otherwise make the data COPYs fail.
# The Supabase postgres role may set this (verified), so no table ownership
# (ALTER TABLE ... DISABLE TRIGGER) or superuser is required.
psql "$TEST_DB_URL" -v ON_ERROR_STOP=1 --single-transaction -q \
  -c "SET session_replication_role = replica;" \
  -f "$AUTH_USERS" \
  -c "SET session_replication_role = DEFAULT;"

echo ">> Loading business data..."
psql "$TEST_DB_URL" -v ON_ERROR_STOP=1 --single-transaction -q \
  -c "SET session_replication_role = replica;" \
  -f "$PUBLIC_DATA" \
  -c "SET session_replication_role = DEFAULT;"

echo ">> Scrubbing credentials on test..."
psql "$TEST_DB_URL" -v ON_ERROR_STOP=1 --single-transaction -q -c \
  "UPDATE auth.users SET encrypted_password='', confirmation_token='', recovery_token='', email_change_token_new='', email_change_token_current=''; DELETE FROM auth.identities; DELETE FROM auth.sessions; DELETE FROM auth.refresh_tokens;"

echo ">> Setting known test password for admin accounts..."
# The scrub blanks all passwords, so no one could log in. Set a known bcrypt
# password (via pgcrypto, the same hash family GoTrue verifies) for the test
# admin accounts so the test env stays loggable after every refresh.
psql "$TEST_DB_URL" -v ON_ERROR_STOP=1 --single-transaction -q -c \
  "UPDATE auth.users SET encrypted_password = crypt('TestAdmin@123', gen_salt('bf', 10)) WHERE email IN ('superadmin@test.com','aruundoorstep@gmail.com','skyywaytravels@gmail.com');"

echo ">> Done. Test DB synced from prod."
