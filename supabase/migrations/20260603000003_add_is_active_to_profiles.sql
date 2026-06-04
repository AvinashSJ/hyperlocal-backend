-- Add is_active column to profiles (admin panel requires this)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

-- Set existing admin profiles to active
UPDATE public.profiles
SET is_active = true
WHERE is_active IS NULL;
