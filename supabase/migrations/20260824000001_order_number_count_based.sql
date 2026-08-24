-- Fix: Switch order_number from sequence-based to MAX-based generation.
--
-- Problem: The global `order_number_seq` uses nextval() which advances
-- permanently even on transaction rollback. Failed Flutter order attempts
-- waste sequence values, creating gaps (e.g. 002, 004, 006 instead of
-- 001, 002, 003).
--
-- Solution: Use MAX(existing numbers with this prefix) + 1 instead of
-- nextval(). This is gap-proof because it always finds the highest
-- existing number regardless of how many gaps exist.
--
-- Also renumbers existing orders to close current gaps.

-- ============================================================================
-- 1. Renumber existing orders to close gaps
-- ============================================================================

-- 1a. Move all orders with known prefixes to temp values (avoid UNIQUE conflicts)
UPDATE public.orders
SET order_number = 'ADORD-TEMP-' || LPAD(
  (SUBSTRING(order_number FROM LENGTH('ADORD') + 2))::int::TEXT, 6, '0'
)
WHERE order_number ~ '^ADORD-[0-9]+$';

UPDATE public.orders
SET order_number = 'SEORD-TEMP-' || LPAD(
  (SUBSTRING(order_number FROM LENGTH('SEORD') + 2))::int::TEXT, 6, '0'
)
WHERE order_number ~ '^SEORD-[0-9]+$';

-- Also handle any legacy "ORD-YYYY-NNNNNN" placeholders from Flutter
UPDATE public.orders
SET order_number = 'ORD-TEMP-' || SUBSTRING(order_number FROM 5)
WHERE order_number ~ '^ORD-[0-9]{4}-[0-9]+$';

-- 1b. Assign sequential numbers ordered by created_at
WITH ranked AS (
  SELECT id,
    SUBSTRING(order_number FROM 1 FOR POSITION('-TEMP-' IN order_number) - 1) AS prefix,
    ROW_NUMBER() OVER (
      PARTITION BY SUBSTRING(order_number FROM 1 FOR POSITION('-TEMP-' IN order_number) - 1)
      ORDER BY created_at
    ) AS rn
  FROM public.orders
  WHERE order_number LIKE '%-TEMP-%'
)
UPDATE public.orders o
SET order_number = r.prefix || '-' || LPAD(r.rn::TEXT, 6, '0')
FROM ranked r
WHERE o.id = r.id;

-- ============================================================================
-- 2. Add UNIQUE constraint on order_number (safety net)
-- ============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'orders_order_number_unique'
      AND conrelid = 'public.orders'::regclass
  ) THEN
    ALTER TABLE public.orders
      ADD CONSTRAINT orders_order_number_unique UNIQUE (order_number);
  END IF;
END $$;

-- ============================================================================
-- 3. Replace generate_order_number() with MAX-based approach
-- ============================================================================
CREATE OR REPLACE FUNCTION public.generate_order_number(p_store_id UUID)
RETURNS TEXT AS $$
DECLARE
  v_prefix TEXT;
  v_next INT;
BEGIN
  IF p_store_id IS NOT NULL THEN
    SELECT COALESCE(order_id_prefix, 'ORD')
      INTO v_prefix
    FROM public.stores
    WHERE id = p_store_id;
  END IF;

  IF v_prefix IS NULL OR v_prefix = '' THEN
    v_prefix := 'ORD';
  END IF;

  -- Advisory lock serializes concurrent order generation per prefix.
  -- Prevents two simultaneous triggers from reading the same MAX and
  -- generating duplicate numbers.
  PERFORM pg_advisory_xact_lock(hashtext('order_num:' || v_prefix));

  -- Find the highest existing number with this prefix and add 1.
  -- The regex extracts the numeric suffix; non-matching rows contribute 0.
  SELECT COALESCE(
    MAX(
      CASE
        WHEN order_number ~ ('^' || v_prefix || '-[0-9]+$')
        THEN (SUBSTRING(order_number FROM LENGTH(v_prefix) + 2))::int
        ELSE 0
      END
    ), 0
  ) + 1 INTO v_next
  FROM public.orders;

  RETURN v_prefix || '-' || LPAD(v_next::TEXT, 6, '0');
END;
$$ LANGUAGE plpgsql;
