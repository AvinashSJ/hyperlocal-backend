-- P28: Restrict Super Admin from the Staff module.
--
-- User request: "Staff module under management must be accessible to the
-- store manager, not accessible to the superadmin - because staff can be
-- created from admin users as well"
--
-- Super Admins can create staff via the /users page (users/actions.ts
-- :createUser calls supabase.auth.admin.createUser and supports any role).
-- The /staff page is intended for store managers who manage their store's
-- staff. This migration removes the `staff` permission from the Super
-- Admin role so the role JSON reflects the new policy.
--
-- This is documentation/defense-in-depth. The application code also enforces
-- the rule via MasterLayout's `superAdminHidden` array and the staff
-- actions' `isSuperAdmin` check (which throws PermissionError). The role
-- JSON change ensures consistency if a custom role with `isSuperAdmin` is
-- ever created with elevated permissions on the staff module.
--
-- The Manager and Staff roles are not touched. Manager keeps
-- `staff: ["view", "create", "edit", "delete"]` (P28 confirmation), and
-- Staff keeps `staff: ["view"]` (the original seed in
-- 20260613000001_add_staff_type.sql).
--
-- Idempotency: the WHERE clause `permissions->'staff' IS NOT NULL` only
-- matches rows that currently have a `staff` array. The UPDATE is a
-- no-op for Super Admin roles that already have `[]` (or no `staff` key).

UPDATE public.roles
SET permissions = jsonb_set(
  permissions,
  '{staff}',
  '[]'::jsonb
)
WHERE name = 'Super Admin'
  AND permissions->'staff' IS NOT NULL;
