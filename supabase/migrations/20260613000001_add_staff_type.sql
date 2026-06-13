-- Allow staff profiles without auth.users entries
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_id_fkey,
  ALTER COLUMN id SET DEFAULT gen_random_uuid();

-- Track staff function (packing / delivery)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS staff_type TEXT CHECK (staff_type IN ('packing', 'delivery'));

-- Add staff module to existing role permissions
UPDATE public.roles
SET permissions = permissions || '{"staff": ["view", "create", "edit", "delete"]}'::jsonb
WHERE name IN ('Super Admin', 'Manager');

UPDATE public.roles
SET permissions = permissions || '{"staff": ["view"]}'::jsonb
WHERE name = 'Staff';
