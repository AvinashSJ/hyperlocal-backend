-- Hotfix: Fix order numbering for Flutter orders.
--
-- Root cause: Two triggers were competing:
--   1. assign_order_number() — fires on orders INSERT, sets order_number
--      to "ORD-2026-NNNNNN" using nextval (from initial schema, not in
--      our migrations).
--   2. set_order_store_id() — fires on order_items INSERT, calls
--      generate_order_number() to set ADORD-NNNNNN.
--
-- Flutter inserts the order first (trigger 1 fires, sets placeholder),
-- then inserts order_items (trigger 2 fires but store_id may already
-- be set, so it skips the UPDATE).
--
-- Additionally, two UNIQUE constraints on order_number blocked
-- Flutter's hardcoded placeholder:
--   - orders_order_number_unique (added by our migration)
--   - orders_order_number_key (auto-generated from initial schema)
--
-- Fix:
--   1. Drop the old assign_order_number trigger + function
--   2. Drop both UNIQUE constraints
--   3. set_order_store_id() now handles everything on order_items INSERT

-- 1. Drop old trigger and function from initial schema
DROP TRIGGER IF EXISTS trg_assign_order_number ON public.orders;
DROP FUNCTION IF EXISTS public.assign_order_number();

-- 2. Drop UNIQUE constraints that block Flutter's placeholder
ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_order_number_unique;
ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_order_number_key;

-- 3. Add BEFORE INSERT trigger to set placeholder order_number.
--    Flutter doesn't send order_number. The old trg_assign_order_number
--    trigger handled this. After dropping it, the NOT NULL constraint
--    on order_number blocks every INSERT. This trigger sets a temporary
--    placeholder ('PENDING-{id}') so the row can be created. The
--    set_order_store_id() trigger on order_items INSERT then replaces
--    it with the real ADORD-NNNNNN number.
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
