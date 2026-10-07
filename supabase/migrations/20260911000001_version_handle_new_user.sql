-- Version-control the dashboard-managed `on_auth_user_created` trigger,
-- which previously lived only on production (created via the Supabase
-- dashboard, NOT in these migrations). Test and prod registration paths are
-- now identical.
--
-- Background:
-- - On prod, an `on_auth_user_created` AFTER INSERT trigger on `auth.users`
--   calls `handle_new_user()`, which auto-creates the `profiles` row for a
--   new signup (id, email, full_name, role='customer') so authentication
--   never blocks on a missing profile. The Flutter app then completes the
--   row during registration (phone, dob, pin_set) via an atomic upsert.
-- - Test had NO such trigger, so signups that abandoned the registration
--   form could not reproduce the prod orphan-row behavior.
--
-- This migration mirrors the prod objects exactly. On prod it is a NO-OP
-- (identical function + trigger already exist). Note: `phone` is deliberately
-- NOT seeded here; the `sync_profile_phone_from_auth` BEFORE INSERT trigger
-- on profiles already backfills phone from auth.users phone + the 4 supported
-- raw_user_meta_data keys when present, and for Google signups the number
-- only exists after the registration form (written by the Flutter client).
--
-- Idempotent: DROP + CREATE (DROP forces PostgreSQL plan-cache invalidation
-- for trigger-bound functions, per AGENTS.md).

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  BEGIN
    INSERT INTO public.profiles (id, email, full_name, role)
    VALUES (
      NEW.id,
      NEW.email,
      NEW.raw_user_meta_data ->> 'full_name',
      'customer'
    )
    ON CONFLICT (id) DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    -- Never let a profile-sync failure block authentication. The Flutter
    -- app self-heals by upserting the profile row during registration.
    RAISE WARNING 'handle_new_user: profile sync skipped for %: %', NEW.id, SQLERRM;
  END;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();