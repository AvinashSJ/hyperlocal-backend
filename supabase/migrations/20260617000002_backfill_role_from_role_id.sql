-- Backfill the `role` column for profiles that have a role_id but the role
-- defaulted to 'customer'. This is the data fix for the admin `createUser`
-- bug where role_id was set but role stayed at the DB default.
-- The `role` column is what the admin/customer page filters use for segmentation.

UPDATE public.profiles p
SET role = CASE r.name
  WHEN 'Super Admin' THEN 'superadmin'
  WHEN 'Manager' THEN 'admin'
  WHEN 'Staff' THEN 'admin'
  ELSE 'admin'
END
FROM public.roles r
WHERE p.role_id = r.id
  AND p.role = 'customer';
