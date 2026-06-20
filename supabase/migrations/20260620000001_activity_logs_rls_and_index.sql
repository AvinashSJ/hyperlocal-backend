-- P25: Add RLS policy + index for the activity_logs table.
--
-- The activity_logs table was created in 20260603000001_roles_permissions.sql
-- but no policy or index was added at the time. This migration:
--   1. Enables RLS and adds an "Admin all" policy (matches every other admin
--      table — see 20260523000001_admin_tables.sql, 20260613000002_add_commissions.sql,
--      20260617000007_store_categories_table.sql).
--   2. Adds a covering index on (entity_type, entity_id, created_at DESC) so
--      the per-product audit-log query (the most common read pattern) is
--      fast as the table grows.
--
-- Defense-in-depth only — the service role bypasses RLS, so the new admin
-- feature works regardless. Flutter/anonymous clients have no need to read
-- this table; the policy is the correct default.

ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin all" ON public.activity_logs;
CREATE POLICY "Admin all" ON public.activity_logs
  FOR ALL USING (public.is_admin());

CREATE INDEX IF NOT EXISTS activity_logs_entity_idx
  ON public.activity_logs (entity_type, entity_id, created_at DESC);
