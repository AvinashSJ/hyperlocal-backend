-- P39: grant invoices:view to the Staff role.
--
-- The Staff role was intentionally restricted to view-only on most
-- modules, but the original seed migration never added an
-- `invoices` permission to it. Without this, the Staff nav link
-- for Invoices never renders, and staff can't download order
-- invoices — which the operations team needs to do (printed copies
-- go into the packing handoff folder).
--
-- Idempotent: the WHERE clause skips roles that already have
-- `invoices` containing `view`.
UPDATE public.roles
SET permissions = permissions || '{"invoices": ["view"]}'::jsonb
WHERE name = 'Staff'
  AND NOT (permissions->'invoices' @> '["view"]'::jsonb);
