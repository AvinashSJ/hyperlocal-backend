-- ============================================================================
-- P62: Grant the 'returns' permission to all 3 system roles
-- ----------------------------------------------------------------------------
-- Adds the new `returns` module to the role JSONB for Super Admin,
-- Manager, and Staff. Same idempotent pattern as P28
-- (20260620000003_grant_manager_staff_module.sql): uses jsonb_set
-- with create_if_missing=true, and a NOT-clause to skip roles
-- that already have the full permission set.
--
-- Permission shape:
--   Super Admin: returns: [view, create, edit, delete]
--   Manager    : returns: [view, create, edit, delete]
--   Staff      : returns: [view]
--
-- Notes on Manager vs Staff:
--   Manager gets full CRUD because Store Managers handle returns
--   for their store's orders (the SLA is enforced server-side for
--   customer-raised requests; Manager-raised requests bypass the
--   SLA as a customer-service exception).
--   Staff is read-only because Staff can SEE the Return request
--   status on the orders page (badge + detail panel) but cannot
--   transition states. They can see a pending return on an order
--   and know to flag it to the Manager.
-- ============================================================================

UPDATE public.roles
SET
  permissions = jsonb_set(
    permissions,
    '{returns}',
    to_jsonb(COALESCE(permissions->'returns', '[]'::jsonb) ||
      (CASE
        WHEN permissions->'returns' @> '["view","create","edit","delete"]'::jsonb
          THEN '[]'::jsonb
        WHEN name = 'Staff'
          THEN '["view"]'::jsonb
        ELSE '["view","create","edit","delete"]'::jsonb
      END)),
    true
  ),
  updated_at = now()
WHERE name IN ('Super Admin', 'Manager', 'Staff')
  AND NOT (permissions->'returns' @> '["view","create","edit","delete"]'::jsonb)
  AND NOT (name = 'Staff' AND permissions->'returns' @> '["view"]'::jsonb);
