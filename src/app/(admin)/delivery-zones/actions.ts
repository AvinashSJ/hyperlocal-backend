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

export async function getDeliveryZones(storeId?: string | null) {
  const supabase = createAdminClient();
  let query = supabase
    .from("delivery_zones")
    .select("*")
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

  const { error } = await supabase.from("delivery_zones").insert(data);
  if (error) throw new Error(error.message);
  revalidatePath("/delivery-zones");
}

export async function updateDeliveryZone(id: string, formData: FormData) {
  await assertPermission("delivery_zones", "edit");
  const supabase = createAdminClient();
  const pincodesRaw = String(formData.get("pincodes") ?? "");
  const pincodes = pincodesRaw ? pincodesRaw.split(",").map((p) => p.trim()).filter(Boolean) : [];
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

  const { error } = await supabase.from("delivery_zones").update(data).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/delivery-zones");
}

export async function deleteDeliveryZone(id: string) {
  await assertPermission("delivery_zones", "delete");
  const supabase = createAdminClient();
  const { error } = await supabase.from("delivery_zones").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/delivery-zones");
}
