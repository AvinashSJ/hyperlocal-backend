-- Auto-sync the `role` text column whenever `role_id` changes on profiles.
-- Defense-in-depth against desync caused by Flutter app or direct SQL updates
-- that set `role_id` without the corresponding `role` value.
-- The admin panel's updateUser already syncs manually; this trigger catches
-- all other paths (Flutter RLS updates, direct SQL, Edge Functions).

CREATE OR REPLACE FUNCTION public.sync_role_from_role_id()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.role_id IS NULL THEN
    NEW.role := 'customer';
  ELSE
    NEW.role := COALESCE(
      (SELECT CASE r.name
        WHEN 'Super Admin' THEN 'superadmin'
        ELSE 'admin'
      END FROM public.roles r WHERE r.id = NEW.role_id),
      'customer'
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_sync_role ON public.profiles;

CREATE TRIGGER trg_sync_role
  BEFORE INSERT OR UPDATE OF role_id ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_role_from_role_id();
