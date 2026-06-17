-- Sync the `role` column with `role_id` for all profiles that have a role_id.
-- This is the data fix for the `updateUserRole` bug where only `role_id` was
-- updated and `role` was left stale, causing users to appear in the wrong list.
-- Staff are mapped to "admin" (staff are admin panel users, distinguished by role_id).
-- Customers (`role_id IS NULL`) are left untouched.

UPDATE public.profiles p
SET role = CASE r.name
  WHEN 'Super Admin' THEN 'superadmin'
  ELSE 'admin'
END
FROM public.roles r
WHERE p.role_id = r.id
  AND p.role <> CASE r.name
        WHEN 'Super Admin' THEN 'superadmin'
        ELSE 'admin'
      END;
