-- Apply this SQL in the Supabase Dashboard SQL Editor:
-- https://supabase.com/dashboard/project/xjmngvxbaxlutupqavdr/sql/new

-- Update get_applicable_delivery_zone to support radius-based fallback.
-- Tries polygon boundary match first, then falls back to ST_DWithin
-- using the store's lat/lng and the zone's radius_km.
-- Among radius matches, the smallest radius that contains the point wins.

CREATE OR REPLACE FUNCTION public.get_applicable_delivery_zone(
  p_lat double precision,
  p_lng double precision,
  p_store_id uuid
)
RETURNS TABLE(
  id uuid,
  name text,
  delivery_charge numeric,
  free_delivery_min_order numeric,
  is_express boolean
)
LANGUAGE sql
STABLE
AS $$
  WITH candidates AS (
    -- 1. Polygon boundary match (priority 0 — highest)
    SELECT
      dz.id,
      dz.name,
      dz.delivery_charge,
      COALESCE(dz.free_delivery_min_order, 0) AS free_delivery_min_order,
      dz.is_express,
      0 AS priority,
      dz.radius_km
    FROM public.delivery_zones dz
    WHERE dz.store_id = p_store_id
      AND dz.is_active = true
      AND dz.boundary IS NOT NULL
      AND ST_Within(
        ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326),
        dz.boundary
      )

    UNION ALL

    -- 2. Radius-based proximity match (priority 1 — fallback)
    SELECT
      dz.id,
      dz.name,
      dz.delivery_charge,
      COALESCE(dz.free_delivery_min_order, 0) AS free_delivery_min_order,
      dz.is_express,
      1 AS priority,
      dz.radius_km
    FROM public.delivery_zones dz
    JOIN public.stores s ON s.id = dz.store_id
    WHERE dz.store_id = p_store_id
      AND dz.is_active = true
      AND dz.radius_km IS NOT NULL
      AND dz.radius_km > 0
      AND s.lat IS NOT NULL
      AND s.lng IS NOT NULL
      AND ST_DWithin(
        ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography,
        ST_SetSRID(ST_MakePoint(s.lng, s.lat), 4326)::geography,
        dz.radius_km * 1000
      )
  )
  SELECT c.id, c.name, c.delivery_charge, c.free_delivery_min_order, c.is_express
  FROM candidates c
  ORDER BY c.priority ASC, c.radius_km ASC NULLS LAST
  LIMIT 1;
$$;
