#!/usr/bin/env bash
# =============================================================================
# Catalog sync: PROD -> TEST  (upsert merge, additive only)
#
# Copies just the product/store catalog from PROD into TEST. Matching rows
# (by primary key) are overwritten with prod's latest values, new rows are
# inserted, and rows that exist only on TEST are kept. Nothing is truncated
# or deleted, and no auth/user/customer data is ever touched.
#
# Tables synced (9):
#   stores, profiles (store owners only), categories, banners, faqs, products,
#   product_variants, product_images, store_categories
#
# Every other table (orders, invoices, activity_logs, customer profiles,
# auth.*, ...) is left completely untouched on TEST.
#
# Env (optional if config files exist next to this script):
#   PROD_DB_URL  - libpq connection string for prod (else scripts/.backup.env)
#   TEST_DB_URL  - libpq connection string for test (else scripts/.sync.env)
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

TABLES=(
  stores
  profiles      # filtered: only store owner profiles
  categories
  banners
  faqs
  products
  product_variants
  product_images
  store_categories
)

# --- Connection strings -----------------------------------------------------
if [ -z "${PROD_DB_URL:-}" ] && [ -f "$SCRIPT_DIR/.backup.env" ]; then
  pghost="$(   sed -n 's/^PGHOST=//p'     "$SCRIPT_DIR/.backup.env" | tr -d '\r' | tail -n1)"
  pgport="$(   sed -n 's/^PGPORT=//p'     "$SCRIPT_DIR/.backup.env" | tr -d '\r' | tail -n1)"
  pguser="$(   sed -n 's/^PGUSER=//p'     "$SCRIPT_DIR/.backup.env" | tr -d '\r' | tail -n1)"
  pgpass="$(   sed -n 's/^PGPASSWORD=//p' "$SCRIPT_DIR/.backup.env" | tr -d '\r' | tail -n1)"
  [ -n "$pghost" ] && [ -n "$pguser" ] && [ -n "$pgpass" ] || {
    echo "ERROR: cannot derive PROD_DB_URL from scripts/.backup.env (need PGHOST/PGUSER/PGPASSWORD)" >&2
    exit 1
  }
  pgport="${pgport:-5432}"
  PROD_DB_URL="host=$pghost port=$pgport user=$pguser password=$pgpass dbname=postgres"
fi

if [ -z "${TEST_DB_URL:-}" ] && [ -f "$SCRIPT_DIR/.sync.env" ]; then
  TEST_DB_URL="$(sed -n 's/^TEST_DB_URL=//p' "$SCRIPT_DIR/.sync.env" | tr -d '\r' | tail -n1)"
fi

: "${PROD_DB_URL:?PROD_DB_URL is required (set it or provide scripts/.backup.env)}"
: "${TEST_DB_URL:?TEST_DB_URL is required (set it or provide scripts/.sync.env)}"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# --- Upsert helper (runs inside the test session) ----------------------------
cat > "$TMP/merge_fn.sql" <<'SQL'
CREATE OR REPLACE FUNCTION pg_temp.merge_from_staging(_schema text, _table text)
RETURNS void LANGUAGE plpgsql
AS $$
DECLARE
  _pk  text;
  _set text;
BEGIN
  -- primary key columns, in index order
  SELECT string_agg(a.attname, ', ' ORDER BY k.ord)
    INTO _pk
    FROM pg_index i
    CROSS JOIN LATERAL unnest(i.indkey) WITH ORDINALITY AS k(attnum, ord)
    JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = k.attnum
   WHERE i.indrelid = format('%I.%I', _schema, _table)::regclass
     AND i.indisprimary;

  IF _pk IS NULL OR _pk = '' THEN
    RAISE EXCEPTION 'no primary key on %.%', _schema, _table;
  END IF;

  -- update target = every column except the PKs
  SELECT string_agg(format('%I = EXCLUDED.%I', column_name, column_name), ', ' ORDER BY ordinal_position)
    INTO _set
    FROM information_schema.columns
   WHERE table_schema = _schema
     AND table_name   = _table
     AND column_name <> ALL (string_to_array(_pk, ', '));

  IF _set IS NULL OR _set = '' THEN
    EXECUTE format('INSERT INTO %I.%I SELECT * FROM pg_temp._stg ON CONFLICT (%s) DO NOTHING',
                   _schema, _table, _pk);
  ELSE
    EXECUTE format('INSERT INTO %I.%I SELECT * FROM pg_temp._stg ON CONFLICT (%s) DO UPDATE SET %s',
                   _schema, _table, _pk, _set);
  END IF;
END
$$;
SQL

merge_table() {
  local t="$1" filter="${2:-}"

  echo ">> Dumping prod: public.$t"
  pg_dump "$PROD_DB_URL" --data-only --no-owner -t "public.$t" \
    --file "$TMP/data_$t.sql"

  # Rewrite the COPY header so the data lands in the staging temp table.
  sed -E 's/^COPY public\.[^ (]+ /COPY pg_temp._stg /' "$TMP/data_$t.sql" > "$TMP/staged_$t.sql"

  echo ">> Upserting into test: public.$t"
  psql "$TEST_DB_URL" -v ON_ERROR_STOP=1 --single-transaction -q \
    -c "CREATE TEMP TABLE _stg AS TABLE public.$t WITH NO DATA;" \
    -f "$TMP/merge_fn.sql" \
    -c "SET session_replication_role = replica;" \
    -f "$TMP/staged_$t.sql" \
    -c "SET session_replication_role = DEFAULT;" \
    -c "${filter:-SELECT NULL;}" \
    -c "SELECT pg_temp.merge_from_staging('public', '$t');"
}

echo ">> Catalog sync PROD -> TEST (additive, no truncate, no auth)"
for t in "${TABLES[@]}"; do
  if [ "$t" = "profiles" ]; then
    # Only store owner profiles (their auth.users/credentials stay untouched).
    # Prune the staging table because this pg_dump has no --where support.
    merge_table "$t" 'DELETE FROM pg_temp._stg WHERE id NOT IN (SELECT owner_id FROM public.stores);'
  else
    merge_table "$t"
  fi
done

echo ">> Done. Catalog synced; all other test data untouched."