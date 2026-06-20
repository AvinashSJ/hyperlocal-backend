-- P31: First-login password reset flow.
--
-- When a Super Admin / Manager resets a user's password (from the
-- /users or /staff edit modal), the user is marked with
-- must_reset_password = true. On their next successful sign-in, the
-- login flow redirects them to /auth/reset-password where they set
-- a permanent password. After that, the column is cleared.
--
-- This migration just adds the column; the application logic that
-- reads/writes it lives in the new auth/users/staff actions.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS must_reset_password BOOLEAN NOT NULL DEFAULT false;

-- Index for the sign-in lookup: "is this user being forced to reset?"
-- The query is a single-row PK lookup so the index is mostly cosmetic,
-- but it documents the read pattern.
CREATE INDEX IF NOT EXISTS profiles_must_reset_idx
  ON public.profiles (must_reset_password)
  WHERE must_reset_password = true;
