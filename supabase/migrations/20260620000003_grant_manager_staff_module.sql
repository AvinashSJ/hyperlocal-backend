-- Grant the staff module permission to the Manager role.
-- P28 (staff module restricted to store managers) was implemented as a
-- UI/scope fix only; the underlying role JSONB was never updated, so
-- the Staff nav link was not rendering for Managers. MasterLayout
-- requires permissions.staff to include "view" to render the child
-- link under the Management group.
--
-- The corresponding seed migration
-- (20260603000001_roles_permissions.sql) was updated to add the staff
-- permission to the Manager row, so fresh installs are correct. This
-- migration backfills the same permission for existing Manager role
-- rows that were created before that seed change.
--
-- Idempotent: uses jsonb set with create_if_missing semantics via
-- coalesce, so re-running the migration is a no-op.
UPDATE public.roles
SET
  permissions = jsonb_set(
    permissions,
    '{staff}',
    to_jsonb(COALESCE(permissions->'staff', '[]'::jsonb) ||
      (CASE
        WHEN permissions->'staff' @> '["view","create","edit","delete"]'::jsonb
          THEN '[]'::jsonb
        ELSE '["view","create","edit","delete"]'::jsonb
      END)),
    true
  ),
  updated_at = now()
WHERE name = 'Manager'
  AND NOT (permissions->'staff' @> '["view","create","edit","delete"]'::jsonb);
