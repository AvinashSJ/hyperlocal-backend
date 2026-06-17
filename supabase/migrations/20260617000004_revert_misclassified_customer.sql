-- Revert misclassified customer 9502330028 back to customer status.
-- This user was a Flutter app customer (no email, phone-only signup) whose
-- role_id was changed to Staff via the admin role dropdown. The updateUserRole
-- bug kept role = 'customer' but set role_id = 3 (Staff), and the previous
-- backfill migration bumped role to 'admin' (correct mapping, but wrong intent).
-- They are a customer, not staff, so we restore them.

UPDATE public.profiles
SET role = 'customer',
    role_id = NULL
WHERE id = '35c38d92-ca91-4ade-86ab-210d4cba6f95';
