-- Strip Staff role to only orders + invoices (order processing only)
-- All other modules are removed — no dashboard, products, categories, etc.
UPDATE public.roles
SET
  description = 'Order processing — can view and update orders, and view invoices',
  permissions = '{
    "orders": ["view", "edit"],
    "invoices": ["view"]
  }'::jsonb,
  updated_at = now()
WHERE name = 'Staff';
