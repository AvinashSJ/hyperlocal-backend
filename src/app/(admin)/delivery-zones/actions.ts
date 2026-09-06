"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertPermission } from "@/lib/require-permission";

type ZoneInput = {
  name: string;
  store_id: string;
  pincodes: string[];
  radius_km: number;
  delivery_charge: number;
  free_delivery_min_order: number;
  min_order_value: number | null;
  max_order_value: number | null;
  min_distance_km: number | null;
  max_distance_km: number | null;
  is_active: boolean;
  is_express: boolean;
};

function parseBoundary(raw: string | null): number[][] | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed) || parsed.length < 3) return null;
    for (const pt of parsed) {
      if (!Array.isArray(pt) || pt.length < 2 || typeof pt[0] !== "number" || typeof pt[1] !== "number") return null;
    }
    return parsed as number[][];
  } catch {
    return null;
  }
}

function makeGeoJsonPolygon(boundary: number[][]): string {
  const coords = boundary.map(([lat, lng]) => [lng, lat]);
  return JSON.stringify({
    type: "Polygon",
    coordinates: [[...coords, coords[0]]],
  });
}

const LIST_COLUMNS = "id, store_id, name, pincodes, radius_km, delivery_charge, free_delivery_min_order, min_order_value, max_order_value, min_distance_km, max_distance_km, is_active, is_express, created_at";

export async function getDeliveryZones(storeId?: string | null) {
  const supabase = createAdminClient();
  let query = supabase
    .from("delivery_zones")
    .select(LIST_COLUMNS)
    .order("name", { ascending: true });
  if (storeId) query = query.eq("store_id", storeId);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data ?? [];
}

function toNullableNumber(raw: FormDataEntryValue | null): number | null {
  if (raw === null || raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function parseZoneInput(formData: FormData): ZoneInput {
  const pincodesRaw = String(formData.get("pincodes") ?? "");
  return {
    name: String(formData.get("name") ?? "").trim(),
    store_id: String(formData.get("store_id") ?? "").trim(),
    pincodes: pincodesRaw ? pincodesRaw.split(",").map((p) => p.trim()).filter(Boolean) : [],
    radius_km: Number(formData.get("radius_km") ?? 0),
    delivery_charge: Number(formData.get("delivery_charge") ?? 0),
    free_delivery_min_order: Number(formData.get("free_delivery_min_order") ?? 0),
    min_order_value: toNullableNumber(formData.get("min_order_value")),
    max_order_value: toNullableNumber(formData.get("max_order_value")),
    min_distance_km: toNullableNumber(formData.get("min_distance_km")),
    max_distance_km: toNullableNumber(formData.get("max_distance_km")),
    is_active: formData.get("is_active") === "on" || formData.get("is_active") === "true",
    is_express: formData.get("is_express") === "on" || formData.get("is_express") === "true",
  };
}

function validateZoneInput(data: ZoneInput, boundary: number[][] | null) {
  if (!data.name) throw new Error("Zone name is required");
  if (!data.store_id) throw new Error("Store ID is required");
  if (data.radius_km < 0) throw new Error("Radius cannot be negative");
  if (data.radius_km <= 0 && !boundary) throw new Error("Set a delivery radius (km) or draw a polygon boundary");
  if (data.delivery_charge < 0 || data.free_delivery_min_order < 0) throw new Error("Charges cannot be negative");
  if (
    data.min_distance_km !== null &&
    data.max_distance_km !== null &&
    data.max_distance_km < data.min_distance_km
  ) throw new Error("Max distance cannot be less than min distance");
  if (
    data.min_order_value !== null &&
    data.max_order_value !== null &&
    data.max_order_value < data.min_order_value
  ) throw new Error("Max order value cannot be less than min order value");
}

export async function createDeliveryZone(formData: FormData) {
  await assertPermission("delivery_zones", "create");
  const supabase = createAdminClient();
  const boundary = parseBoundary(String(formData.get("boundary") ?? ""));
  const data = parseZoneInput(formData);
  validateZoneInput(data, boundary);

  const { data: inserted, error } = await supabase
    .from("delivery_zones")
    .insert(data)
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  if (boundary && inserted?.id) {
    const geojson = makeGeoJsonPolygon(boundary);
    const { error: rpcError } = await supabase.rpc("set_zone_boundary", {
      p_zone_id: inserted.id,
      p_geojson: JSON.parse(geojson),
    });
    if (rpcError) throw new Error(rpcError.message);
  }

  revalidatePath("/delivery-zones");
}

export async function updateDeliveryZone(id: string, formData: FormData) {
  await assertPermission("delivery_zones", "edit");
  const supabase = createAdminClient();
  const boundary = parseBoundary(String(formData.get("boundary") ?? ""));
  const data = parseZoneInput(formData);
  validateZoneInput(data, boundary);

  const { error: updateError } = await supabase.from("delivery_zones").update(data).eq("id", id);
  if (updateError) throw new Error(updateError.message);

  if (boundary) {
    const geojson = makeGeoJsonPolygon(boundary);
    const { error: rpcError } = await supabase.rpc("set_zone_boundary", {
      p_zone_id: id,
      p_geojson: JSON.parse(geojson),
    });
    if (rpcError) throw new Error(rpcError.message);
  } else if (data.radius_km > 0) {
    // Radius-mode save with a blank boundary clears any previously stored polygon
    // so the RPC's boundary match can't outlive an explicit mode switch.
    const { error: clearError } = await supabase.rpc("set_zone_boundary", {
      p_zone_id: id,
      p_geojson: null,
    });
    if (clearError) throw new Error(clearError.message);
  }

  revalidatePath("/delivery-zones");
}

export type ZoneForEdit = {
  id: string;
  store_id: string;
  name: string;
  pincodes: string[];
  radius_km: number;
  delivery_charge: number;
  free_delivery_min_order: number;
  min_order_value: number | null;
  max_order_value: number | null;
  min_distance_km: number | null;
  max_distance_km: number | null;
  is_active: boolean;
  is_express: boolean;
  boundary: number[][] | null;
};

export async function getZoneForEdit(id: string): Promise<ZoneForEdit> {
  const supabase = createAdminClient();
  const { data: zone, error } = await supabase
    .from("delivery_zones")
    .select("*")
    .eq("id", id)
    .single();
  if (error) throw new Error(error.message);

  const { data: boundaryGeoJson, error: rpcError } = await supabase.rpc("get_zone_boundary", {
    p_zone_id: id,
  });
  if (rpcError) throw new Error(rpcError.message);

  let boundary: number[][] | null = null;
  if (boundaryGeoJson) {
    const coords = (boundaryGeoJson as { coordinates: number[][][] })?.coordinates?.[0];
    if (coords) {
      boundary = coords.map(([lng, lat]: number[]) => [lat, lng]);
      boundary.pop();
    }
  }

  return { ...zone, boundary };
}

export async function deleteDeliveryZone(id: string) {
  await assertPermission("delivery_zones", "delete");
  const supabase = createAdminClient();
  const { error } = await supabase.from("delivery_zones").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/delivery-zones");
}
