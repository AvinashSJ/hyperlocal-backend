-- Final fix: Order numbering — RLS + plan cache issues.
--
-- Root causes:
--   1. RLS: generate_order_number() runs inside a trigger called from
--      Flutter's authenticated session. Without SECURITY DEFINER, the
--      function inherits the caller's RLS policies. The authenticated
--      user can only see their own orders, so MAX() returns 0 and the
--      function always produces ADORD-000001.
--   2. Plan cache: CREATE OR REPLACE FUNCTION does not always invalidate
--      PostgreSQL's cached PL/pgSQL plans. DROP + CREATE forces
--      invalidation.
--
-- Fix: SECURITY DEFINER + DROP/CREATE for both functions.

-- ============================================================================
-- 1. Clean up old triggers and constraints (idempotent)
-- ============================================================================

-- Drop old trigger/function from initial schema
DROP TRIGGER IF EXISTS trg_assign_order_number ON public.orders;
DROP FUNCTION IF EXISTS public.assign_order_number();

-- Drop UNIQUE constraints that block Flutter's placeholder
ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_order_number_unique;
ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_order_number_key;

-- Drop old sequence (no longer needed)
DROP SEQUENCE IF EXISTS public.order_number_seq;

-- ============================================================================
-- 2. DROP + CREATE generate_order_number (MAX-based, not nextval)
--    DROP is critical — CREATE OR REPLACE does not invalidate cached plans.
-- ============================================================================

DROP FUNCTION IF EXISTS public.generate_order_number(p_store_id UUID);

CREATE FUNCTION public.generate_order_number(p_store_id UUID)
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
  PERFORM pg_advisory_xact_lock(hashtext('order_num:' || v_prefix));

  -- Find the highest existing number with this prefix and add 1.
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
$$ LANGUAGE plpgsql
SECURITY DEFINER;

-- SECURITY DEFINER is critical: this function is called from triggers
-- that run in the authenticated user's session. Without it, RLS policies
-- restrict which orders MAX() can see, causing the function to always
-- return order_number 000001.

-- ============================================================================
-- 3. DROP + CREATE set_order_store_id (with CASCADE to drop trigger)
--    Must recreate the trigger since CASCADE drops it.
-- ============================================================================

DROP FUNCTION IF EXISTS public.set_order_store_id() CASCADE;

CREATE FUNCTION public.set_order_store_id() RETURNS trigger AS $$
DECLARE
  v_product_store_id UUID;
BEGIN
  IF NEW.product_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT p.store_id
    INTO v_product_store_id
  FROM public.products p
  WHERE p.id = NEW.product_id;

  IF v_product_store_id IS NULL THEN
    RETURN NEW;
  END IF;

  UPDATE public.orders
  SET    store_id = v_product_store_id,
         order_number = public.generate_order_number(v_product_store_id)
  WHERE  id = NEW.order_id
    AND  store_id IS NULL;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Recreate the trigger (dropped by CASCADE above)
DROP TRIGGER IF EXISTS order_items_set_order_store_id ON public.order_items;
CREATE TRIGGER order_items_set_order_store_id
  AFTER INSERT ON public.order_items
  FOR EACH ROW EXECUTE FUNCTION set_order_store_id();

-- ============================================================================
-- 4. BEFORE INSERT placeholder trigger for orders
--    Flutter doesn't send order_number, so we need a placeholder to
--    satisfy the NOT NULL constraint. set_order_store_id() replaces it.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.set_order_number_placeholder()
RETURNS trigger AS $$
BEGIN
  IF NEW.order_number IS NULL THEN
    NEW.order_number := 'PENDING-' || NEW.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_set_order_number_placeholder ON public.orders;
CREATE TRIGGER trg_set_order_number_placeholder
  BEFORE INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.set_order_number_placeholder();
