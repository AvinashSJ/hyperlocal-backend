-- Merge delivery rules into delivery zones
-- Adds condition columns to delivery_zones, migrates data, drops delivery_rules

-- 1. Add condition columns to delivery_zones
ALTER TABLE public.delivery_zones
  ADD COLUMN IF NOT EXISTS min_order_value NUMERIC,
  ADD COLUMN IF NOT EXISTS max_order_value NUMERIC,
  ADD COLUMN IF NOT EXISTS min_distance_km NUMERIC,
  ADD COLUMN IF NOT EXISTS max_distance_km NUMERIC;

-- 2. Migrate existing rule data into zones (one rule per store, first match wins)
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT DISTINCT ON (store_id)
      store_id, min_order_value, max_order_value, min_distance_km, max_distance_km
    FROM public.delivery_rules
    WHERE is_active = true
    ORDER BY store_id, priority ASC
  LOOP
    UPDATE public.delivery_zones
    SET min_order_value = r.min_order_value,
        max_order_value = r.max_order_value,
        min_distance_km = r.min_distance_km,
        max_distance_km = r.max_distance_km
    WHERE store_id = r.store_id
      AND min_order_value IS NULL
      AND max_order_value IS NULL
      AND min_distance_km IS NULL
      AND max_distance_km IS NULL;
  END LOOP;
END $$;

-- 3. Drop the delivery_rules table
DROP TABLE IF EXISTS public.delivery_rules CASCADE;
