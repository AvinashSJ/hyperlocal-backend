-- Restrict Manager role from creating/editing/deleting categories
-- (Super Admin only — Manager keeps only "view")
--
-- User request: "Store manager can't create category! Only superadmin
-- assigned category & subcategory should be visible in the dropdown.
-- if assigned category has the subcategory!"
--
-- The Manager role was seeded with "categories": ["view", "create", "edit", "delete"]
-- (migration 20260603000001_roles_permissions.sql line 51). This migration
-- removes "create", "edit", and "delete" from the categories array for any
-- Manager role that currently has them. Staff is already restricted to
-- ["view"] and is unaffected.
--
-- The application layer also enforces this server-side:
--   - createCategory calls assertPermission("categories", "create")
--   - updateCategory calls assertPermission("categories", "edit")
--   - deleteCategory calls assertPermission("categories", "delete")
-- All three throw PermissionError for Manager after this migration. The UI
-- auto-hides the Add/Edit/Delete buttons via CategoriesClient.tsx because
-- the actionPerms are derived from the role's permissions array.
--
-- Idempotency: the WHERE clause `permissions->'categories' ?| array['create','edit','delete']`
-- only matches rows where at least one of those actions is in the categories
-- array. The UPDATE is a no-op for Managers that don't have them (the new
-- state) or for any other role (Super Admin keeps all four; Staff never had
-- any of them).
--
-- This is forward-looking only. Any categories Manager created before this
-- migration remain in the `categories` table (with no `store_categories` link
-- for the Manager's store), so the products page dropdown won't show them
-- to the Manager until a Super Admin manually links them via /settings or
-- /stores. That's intentional — the Super Admin owns category management.

UPDATE public.roles
SET permissions = jsonb_set(
  permissions,
  '{categories}',
  '["view"]'::jsonb
)
WHERE name = 'Manager'
  AND permissions->'categories' ?| array['create', 'edit', 'delete'];
