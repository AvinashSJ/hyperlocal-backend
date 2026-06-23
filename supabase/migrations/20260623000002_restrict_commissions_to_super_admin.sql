-- P46: Restrict the Commissions module to Super Admin only.
--
-- Previously, Manager had `commissions: ["view", "create", "edit", "delete"]`
-- and Staff had `commissions: ["view"]` (seeded by
-- 20260613000002_add_commissions.sql). The product decision is that
-- commissions are a financial/audit module that should only be visible
-- to Super Admin. Manager + Staff can no longer visit /commissions at
-- all; existing commission rows are unaffected (still readable by
-- Super Admin via the admin client).
--
-- Idempotent: the `? 'commissions'` guard means the UPDATE is a no-op
-- if the key is already missing. The `false` flag on jsonb_set means
-- "do not create the key if missing" — defensive in case a custom
-- role doesn't have the `commissions` key at all.
--
-- Revert: re-add the permission for Manager with
--   UPDATE public.roles
--   SET permissions = jsonb_set(permissions, '{commissions}',
--     '["view", "create", "edit", "delete"]'::jsonb, false),
--       updated_at = now()
--   WHERE name = 'Manager';

UPDATE public.roles
SET permissions = jsonb_set(
  permissions,
  '{commissions}',
  '[]'::jsonb,
  false
),
updated_at = now()
WHERE name IN ('Manager', 'Staff')
  AND permissions ? 'commissions';
