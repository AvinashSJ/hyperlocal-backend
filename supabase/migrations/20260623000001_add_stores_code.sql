-- ============================================================================
-- P43: Add stores.code for per-store invoice numbering
-- ----------------------------------------------------------------------------
-- Adds a short, unique, immutable code to each store. Used to compose
-- per-store invoice numbers (INV-{code}-{year}-{seq}) so that each
-- establishment has its own invoice sequence, as required by most tax
-- regimes (GST in India, VAT elsewhere).
--
-- Format: UPPER(SUBSTRING(id::text, 1, 8)) — e.g. "A1B2C3D4".
-- Guarantees uniqueness within the (very small) store set and is
-- stable for the lifetime of the store (we never regenerate the code).
--
-- Backfill is collision-safe: if two stores happen to share the first
-- 8 chars of their UUID, the second one gets a numeric suffix.
-- ============================================================================

-- 1. Add the column nullable first so existing rows can stay.
ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS code TEXT;

-- 2. Backfill. Loop over NULL rows and assign codes. We use a CTE
-- with a derived seq to guarantee uniqueness even if two UUIDs share
-- their first 8 chars (extremely unlikely but possible).
DO $$
DECLARE
  v_rec RECORD;
  v_seq INT := 0;
  v_base TEXT;
  v_code TEXT;
BEGIN
  FOR v_rec IN
    SELECT id FROM public.stores WHERE code IS NULL ORDER BY created_at
  LOOP
    v_base := UPPER(SUBSTRING(v_rec.id::text, 1, 8));
    v_code := v_base;
    v_seq := 1;
    -- If this code is already taken by another row, append a suffix.
    WHILE EXISTS (SELECT 1 FROM public.stores WHERE code = v_code AND id <> v_rec.id) LOOP
      v_code := v_base || '_' || v_seq::text;
      v_seq := v_seq + 1;
    END LOOP;
    UPDATE public.stores SET code = v_code WHERE id = v_rec.id;
  END LOOP;
END $$;

-- 3. Enforce NOT NULL only if the column isn't already NOT NULL.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'stores'
      AND column_name = 'code' AND is_nullable = 'YES'
  ) THEN
    ALTER TABLE public.stores ALTER COLUMN code SET NOT NULL;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS stores_code_unique
  ON public.stores(code);

-- 4. Add a CHECK constraint if it doesn't already exist.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'stores_code_format_check'
  ) THEN
    ALTER TABLE public.stores
      ADD CONSTRAINT stores_code_format_check
      CHECK (code ~ '^[A-Z0-9_]{4,16}$');
  END IF;
END $$;
