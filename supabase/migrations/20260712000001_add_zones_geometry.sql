-- Enable PostGIS (idempotent)
CREATE EXTENSION IF NOT EXISTS postgis;

-- Add polygon boundary column to delivery_zones
ALTER TABLE public.delivery_zones
  ADD COLUMN IF NOT EXISTS boundary geometry(POLYGON, 4326);

CREATE INDEX IF NOT EXISTS idx_delivery_zones_boundary
  ON public.delivery_zones USING GIST (boundary);

-- RPC: find the active zone containing a given lat/lng for a store.
-- Tries polygon boundary match first, then falls back to radius-based
-- proximity using the store's lat/lng. Among radius matches, the smallest
-- radius that contains the point wins (tightest tier).
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

-- RPC: set the polygon boundary for a zone using GeoJSON
-- GeoJSON format: {"type":"Polygon","coordinates":[[[lng,lat],[lng,lat],...]]}
CREATE OR REPLACE FUNCTION public.set_zone_boundary(
  p_zone_id uuid,
  p_geojson jsonb
) RETURNS void
LANGUAGE sql
AS $$
  UPDATE public.delivery_zones
  SET boundary = ST_SetSRID(ST_GeomFromGeoJSON(p_geojson), 4326)
  WHERE id = p_zone_id;
$$;

-- RPC: get the polygon boundary for a zone as GeoJSON
-- Returns GeoJSON string, or null if no boundary set
CREATE OR REPLACE FUNCTION public.get_zone_boundary(
  p_zone_id uuid
) RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  SELECT ST_AsGeoJSON(dz.boundary)::jsonb
  FROM public.delivery_zones dz
  WHERE dz.id = p_zone_id;
$$;
