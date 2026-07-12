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

const LIST_COLUMNS = "id, store_id, name, pincodes, radius_km, delivery_charge, free_delivery_min_order, is_active, is_express, created_at";

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

export async function createDeliveryZone(formData: FormData) {
  await assertPermission("delivery_zones", "create");
  const supabase = createAdminClient();
  const pincodesRaw = String(formData.get("pincodes") ?? "");
  const pincodes = pincodesRaw ? pincodesRaw.split(",").map((p) => p.trim()).filter(Boolean) : [];
  const boundary = parseBoundary(String(formData.get("boundary") ?? ""));
  const data: ZoneInput = {
    name: String(formData.get("name") ?? ""),
    store_id: String(formData.get("store_id") ?? ""),
    pincodes,
    radius_km: Number(formData.get("radius_km") ?? 0),
    delivery_charge: Number(formData.get("delivery_charge") ?? 0),
    free_delivery_min_order: Number(formData.get("free_delivery_min_order") ?? 0),
    is_active: formData.get("is_active") === "on" || formData.get("is_active") === "true",
    is_express: formData.get("is_express") === "on" || formData.get("is_express") === "true",
  };
  if (!data.name) throw new Error("Zone name is required");
  if (!data.store_id) throw new Error("Store ID is required");

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
  const pincodesRaw = String(formData.get("pincodes") ?? "");
  const pincodes = pincodesRaw ? pincodesRaw.split(",").map((p) => p.trim()).filter(Boolean) : [];
  const boundary = parseBoundary(String(formData.get("boundary") ?? ""));
  const data: ZoneInput = {
    name: String(formData.get("name") ?? ""),
    store_id: String(formData.get("store_id") ?? ""),
    pincodes,
    radius_km: Number(formData.get("radius_km") ?? 0),
    delivery_charge: Number(formData.get("delivery_charge") ?? 0),
    free_delivery_min_order: Number(formData.get("free_delivery_min_order") ?? 0),
    is_active: formData.get("is_active") === "on" || formData.get("is_active") === "true",
    is_express: formData.get("is_express") === "on" || formData.get("is_express") === "true",
  };
  if (!data.name) throw new Error("Zone name is required");

  const { error: updateError } = await supabase.from("delivery_zones").update(data).eq("id", id);
  if (updateError) throw new Error(updateError.message);

  if (boundary) {
    const geojson = makeGeoJsonPolygon(boundary);
    const { error: rpcError } = await supabase.rpc("set_zone_boundary", {
      p_zone_id: id,
      p_geojson: JSON.parse(geojson),
    });
    if (rpcError) throw new Error(rpcError.message);
  }

  revalidatePath("/delivery-zones");
}

export async function getZoneWithBoundary(id: string) {
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
