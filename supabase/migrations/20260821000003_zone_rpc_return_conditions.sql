-- Update get_applicable_delivery_zone to return condition fields.
-- Previously the RPC only returned id, name, delivery_charge,
-- free_delivery_min_order, is_express — the condition columns
-- (min/max order value, min/max distance) were missing, making
-- the eligibility checks in route.ts dead code.

DROP FUNCTION IF EXISTS public.get_applicable_delivery_zone(double precision, double precision, uuid);

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
  is_express boolean,
  min_order_value numeric,
  max_order_value numeric,
  min_distance_km numeric,
  max_distance_km numeric
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
      dz.min_order_value,
      dz.max_order_value,
      dz.min_distance_km,
      dz.max_distance_km,
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
      dz.min_order_value,
      dz.max_order_value,
      dz.min_distance_km,
      dz.max_distance_km,
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
  SELECT
    c.id, c.name, c.delivery_charge, c.free_delivery_min_order,
    c.is_express, c.min_order_value, c.max_order_value,
    c.min_distance_km, c.max_distance_km
  FROM candidates c
  ORDER BY c.priority ASC, c.radius_km ASC NULLS LAST
  LIMIT 1;
$$;
