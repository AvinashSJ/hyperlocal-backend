-- Restrict Manager role from deleting orders (Super Admin only)
--
-- User request: "Store manager shouldn't be able to delete orders, whereas
-- superadmin can delete the orders."
--
-- The Manager role was seeded with "orders": ["view", "create", "edit", "delete"]
-- (migration 20260603000001_roles_permissions.sql line 52). This migration
-- removes "delete" from the orders array for any Manager role that currently
-- has it. Staff is already restricted to ["view", "edit"] and is unaffected.
--
-- The application layer also enforces this server-side: deleteOrder in
-- src/app/(admin)/orders/actions.ts checks isSuperAdmin after assertPermission
-- and throws PermissionError for non-super-admin users. This is the
-- defense-in-depth check (custom roles created via the Roles UI cannot grant
-- order-delete power even if the admin tries).
--
-- Idempotency: the WHERE clause `permissions->'orders' ? 'delete'` only
-- matches rows where "delete" is currently in the orders array. The UPDATE
-- is a no-op for Managers that don't have it (the new state) or for any
-- other role (Super Admin keeps "delete"; Staff never had it).

UPDATE public.roles
SET permissions = jsonb_set(
  permissions,
  '{orders}',
  '["view", "create", "edit"]'::jsonb
)
WHERE name = 'Manager'
  AND permissions->'orders' ? 'delete';
