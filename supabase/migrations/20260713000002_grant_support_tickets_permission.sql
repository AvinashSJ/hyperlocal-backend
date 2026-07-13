-- Grant the 'support_tickets' permission to Super Admin + Manager.
-- Staff has no access. Uses the same idempotent jsonb_set pattern.

UPDATE public.roles
SET
  permissions = jsonb_set(
    permissions,
    '{support_tickets}',
    to_jsonb(COALESCE(permissions->'support_tickets', '[]'::jsonb) ||
      (CASE
        WHEN permissions->'support_tickets' @> '["view","create","edit","delete"]'::jsonb
          THEN '[]'::jsonb
        ELSE '["view","create","edit","delete"]'::jsonb
      END)),
    true
  ),
  updated_at = now()
WHERE name IN ('Super Admin', 'Manager')
  AND NOT (permissions->'support_tickets' @> '["view","create","edit","delete"]'::jsonb);
