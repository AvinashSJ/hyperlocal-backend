-- Keep customer profile phone numbers in sync with Supabase Auth.
-- Mobile registration can create auth.users before inserting public.profiles,
-- and some clients send the number in user metadata instead of auth.users.phone.

CREATE OR REPLACE FUNCTION public.sync_profile_phone_from_auth()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  auth_phone TEXT;
BEGIN
  -- Preserve an explicitly supplied profile phone.
  IF NEW.phone IS NOT NULL AND btrim(NEW.phone) <> '' THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(
    NULLIF(btrim(u.phone), ''),
    NULLIF(btrim(u.raw_user_meta_data ->> 'phone'), ''),
    NULLIF(btrim(u.raw_user_meta_data ->> 'mobile'), ''),
    NULLIF(btrim(u.raw_user_meta_data ->> 'mobile_number'), ''),
    NULLIF(btrim(u.raw_user_meta_data ->> 'phone_number'), '')
  )
  INTO auth_phone
  FROM auth.users AS u
  WHERE u.id = NEW.id;

  IF auth_phone IS NOT NULL THEN
    NEW.phone := auth_phone;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_auth_phone_to_profile()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  auth_phone TEXT;
BEGIN
  SELECT COALESCE(
    NULLIF(btrim(NEW.phone), ''),
    NULLIF(btrim(NEW.raw_user_meta_data ->> 'phone'), ''),
    NULLIF(btrim(NEW.raw_user_meta_data ->> 'mobile'), ''),
    NULLIF(btrim(NEW.raw_user_meta_data ->> 'mobile_number'), ''),
    NULLIF(btrim(NEW.raw_user_meta_data ->> 'phone_number'), '')
  )
  INTO auth_phone;

  IF auth_phone IS NOT NULL THEN
    UPDATE public.profiles
    SET phone = auth_phone
    WHERE id = NEW.id
      AND (phone IS NULL OR btrim(phone) = '');
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_auth_phone_to_profile ON auth.users;

CREATE TRIGGER trg_sync_auth_phone_to_profile
  AFTER INSERT OR UPDATE OF phone, raw_user_meta_data ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_auth_phone_to_profile();

DROP TRIGGER IF EXISTS trg_sync_profile_phone_from_auth ON public.profiles;

CREATE TRIGGER trg_sync_profile_phone_from_auth
  BEFORE INSERT OR UPDATE OF phone ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_profile_phone_from_auth();

-- Repair profiles created before the synchronization trigger was installed.
UPDATE public.profiles AS p
SET phone = source.phone
FROM (
  SELECT
    u.id,
    COALESCE(
      NULLIF(btrim(u.phone), ''),
      NULLIF(btrim(u.raw_user_meta_data ->> 'phone'), ''),
      NULLIF(btrim(u.raw_user_meta_data ->> 'mobile'), ''),
      NULLIF(btrim(u.raw_user_meta_data ->> 'mobile_number'), ''),
      NULLIF(btrim(u.raw_user_meta_data ->> 'phone_number'), '')
    ) AS phone
  FROM auth.users AS u
) AS source
WHERE p.id = source.id
  AND (p.phone IS NULL OR btrim(p.phone) = '')
  AND source.phone IS NOT NULL;