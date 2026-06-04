-- Add "stores" permission to existing roles
UPDATE public.roles
SET permissions = permissions || '{
  "stores": ["view", "create", "edit", "delete"]
}'::jsonb,
    updated_at = now()
WHERE name = 'Super Admin';

UPDATE public.roles
SET permissions = permissions || '{
  "stores": ["view", "create", "edit", "delete"]
}'::jsonb,
    updated_at = now()
WHERE name = 'Manager';

UPDATE public.roles
SET permissions = permissions || '{
  "stores": ["view"]
}'::jsonb,
    updated_at = now()
WHERE name = 'Staff';
