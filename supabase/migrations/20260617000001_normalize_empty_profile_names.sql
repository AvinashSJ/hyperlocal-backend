-- Normalize empty-string text fields to NULL on profiles.
-- Empty strings cause runtime crashes in client components that use
--   `stringVar ?? fallback` (?? only short-circuits on null/undefined, not "").
-- See fix in src/app/(admin)/users/UsersClient.tsx:137 and related sites.

-- Drop NOT NULL so we can store NULL going forward
ALTER TABLE public.profiles
  ALTER COLUMN full_name DROP NOT NULL;

-- Convert existing empty strings to NULL
UPDATE public.profiles
SET full_name = NULL
WHERE full_name = '';

-- Prevent empty strings from sneaking back in
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_full_name_not_empty
  CHECK (full_name IS NULL OR length(full_name) > 0);
