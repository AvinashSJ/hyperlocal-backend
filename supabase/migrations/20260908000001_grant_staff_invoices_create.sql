-- Grant staff invoice CREATION so order-processing staff can generate
-- invoices without a confusing failure.
--
-- Background: updateOrderStatus auto-generates an invoice when an order
-- transitions to "processing" (orders/actions.ts). generateInvoice requires
-- `invoices:create`. Staff previously only had `invoices: ["view"]`, so the
-- auto-invoice threw a PermissionError that surfaced as a "Invoice was not
-- generated" warning every time staff processed an order.
--
-- This adds "create" so the auto-invoice succeeds for staff, and also unlocks
-- the manual [Generate Invoice] retry and Bulk Generate buttons (both gated on
-- invoices:create).
--
-- Staff does NOT get edit/delete — invoices remain create-only for staff;
-- Managers and Super Admins keep their full invoice CRUD unchanged.
--
-- Idempotent: the WHERE clause skips roles that already have create.
UPDATE public.roles
SET permissions = permissions || '{"invoices": ["view", "create"]}'::jsonb,
    updated_at = now()
WHERE name = 'Staff'
  AND NOT (permissions->'invoices' @> '["view", "create"]'::jsonb);
