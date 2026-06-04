"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertPermission } from "@/lib/require-permission";

type SlotInput = {
  name: string;
  zone_id: string;
  start_time: string;
  end_time: string;
  available_days: number[];
  capacity: number;
  is_active: boolean;
};

export async function getDeliverySlots(storeId?: string | null) {
  const supabase = createAdminClient();
  let query = supabase
    .from("delivery_slots")
    .select("*, delivery_zones!inner(store_id)")
    .order("start_time", { ascending: true });
  if (storeId) query = query.eq("delivery_zones.store_id", storeId);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function createDeliverySlot(formData: FormData) {
  await assertPermission("delivery_slots", "create");
  const supabase = createAdminClient();
  const daysRaw = String(formData.get("available_days") ?? "");
  const available_days = daysRaw
    ? daysRaw.split(",").map((d) => parseInt(d.trim(), 10)).filter((n) => !isNaN(n))
    : [];
  const data: SlotInput = {
    name: String(formData.get("name") ?? ""),
    zone_id: String(formData.get("zone_id") ?? ""),
    start_time: String(formData.get("start_time") ?? ""),
    end_time: String(formData.get("end_time") ?? ""),
    available_days,
    capacity: Number(formData.get("capacity") ?? 0),
    is_active: formData.get("is_active") === "on" || formData.get("is_active") === "true",
  };
  if (!data.name) throw new Error("Slot name is required");
  if (!data.zone_id) throw new Error("Zone ID is required");
  if (!data.start_time || !data.end_time) throw new Error("Start and end times are required");

  const { error } = await supabase.from("delivery_slots").insert(data);
  if (error) throw new Error(error.message);
  revalidatePath("/delivery-slots");
}

export async function updateDeliverySlot(id: string, formData: FormData) {
  await assertPermission("delivery_slots", "edit");
  const supabase = createAdminClient();
  const daysRaw = String(formData.get("available_days") ?? "");
  const available_days = daysRaw
    ? daysRaw.split(",").map((d) => parseInt(d.trim(), 10)).filter((n) => !isNaN(n))
    : [];
  const data: SlotInput = {
    name: String(formData.get("name") ?? ""),
    zone_id: String(formData.get("zone_id") ?? ""),
    start_time: String(formData.get("start_time") ?? ""),
    end_time: String(formData.get("end_time") ?? ""),
    available_days,
    capacity: Number(formData.get("capacity") ?? 0),
    is_active: formData.get("is_active") === "on" || formData.get("is_active") === "true",
  };
  if (!data.name) throw new Error("Slot name is required");

  const { error } = await supabase.from("delivery_slots").update(data).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/delivery-slots");
}

export async function deleteDeliverySlot(id: string) {
  await assertPermission("delivery_slots", "delete");
  const supabase = createAdminClient();
  const { error } = await supabase.from("delivery_slots").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/delivery-slots");
}
