-- P38: ensure profiles.staff_type column exists and refresh the
-- PostgREST schema cache. The original migration
-- 20260613000001_add_staff_type.sql adds the same column with the
-- same constraint, but if it was never applied to a given
-- environment the staff module fails with
-- `Could not find the 'staff_type' column of 'profiles' in the
-- schema cache` (Postgres error 42703).
--
-- This migration is idempotent: the IF NOT EXISTS clause is a no-op
-- if the column already exists. The NOTIFY at the end forces
-- PostgREST to reload its in-memory schema cache so the column is
-- queryable immediately after the migration runs.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS staff_type TEXT CHECK (staff_type IN ('packing', 'delivery'));

NOTIFY pgrst, 'reload schema';
