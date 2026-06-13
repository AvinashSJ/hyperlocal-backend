-- Add reports permission module to existing roles
UPDATE public.roles
SET permissions = permissions || '{"reports": ["view"]}'::jsonb
WHERE name IN ('Super Admin', 'Manager', 'Staff');
