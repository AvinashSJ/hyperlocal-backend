-- 1. Ensure Manager has reports:view (DB currently has reports:[] which
--    is an empty array — canAccess sees no "view" action and hides the
--    sidebar link). Upsert the correct value.
UPDATE public.roles
SET permissions = jsonb_set(
  COALESCE(permissions, '{}'::jsonb),
  '{reports}',
  '["view"]'::jsonb
)
WHERE name = 'Manager';

-- 2. Remove reports permission entirely from Staff.
UPDATE public.roles
SET permissions = permissions - 'reports'
WHERE name = 'Staff'
  AND permissions ? 'reports';
