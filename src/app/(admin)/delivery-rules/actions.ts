"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertPermission } from "@/lib/require-permission";

const LIST_COLUMNS =
  "id, store_id, name, min_order_value, max_order_value, min_distance_km, max_distance_km, charge, priority, is_active, created_at";

export type DeliveryRuleRow = {
  id: string;
  store_id: string;
  name: string;
  min_order_value: number | null;
  max_order_value: number | null;
  min_distance_km: number | null;
  max_distance_km: number | null;
  charge: number;
  priority: number;
  is_active: boolean;
  created_at: string;
};

export async function getDeliveryRules(storeId?: string | null) {
  const supabase = createAdminClient();
  let query = supabase
    .from("delivery_rules")
    .select(LIST_COLUMNS)
    .order("priority", { ascending: true });
  if (storeId) query = query.eq("store_id", storeId);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as DeliveryRuleRow[];
}

export async function createDeliveryRule(formData: FormData) {
  await assertPermission("delivery_rules", "create");
  const supabase = createAdminClient();

  const name = String(formData.get("name") ?? "").trim();
  const storeId = String(formData.get("store_id") ?? "").trim();
  if (!name) throw new Error("Rule name is required");
  if (!storeId) throw new Error("Store ID is required");

  const data = {
    name,
    store_id: storeId,
    min_order_value: formData.get("min_order_value") ? Number(formData.get("min_order_value")) : null,
    max_order_value: formData.get("max_order_value") ? Number(formData.get("max_order_value")) : null,
    min_distance_km: formData.get("min_distance_km") ? Number(formData.get("min_distance_km")) : null,
    max_distance_km: formData.get("max_distance_km") ? Number(formData.get("max_distance_km")) : null,
    charge: Number(formData.get("charge") ?? 0),
    priority: Number(formData.get("priority") ?? 0),
    is_active: formData.get("is_active") === "on" || formData.get("is_active") === "true",
  };

  const { error } = await supabase.from("delivery_rules").insert(data);
  if (error) throw new Error(error.message);
  revalidatePath("/delivery-rules");
}

export async function updateDeliveryRule(id: string, formData: FormData) {
  await assertPermission("delivery_rules", "edit");
  const supabase = createAdminClient();

  const name = String(formData.get("name") ?? "").trim();
  if (!name) throw new Error("Rule name is required");

  const data = {
    name,
    store_id: String(formData.get("store_id") ?? "").trim(),
    min_order_value: formData.get("min_order_value") ? Number(formData.get("min_order_value")) : null,
    max_order_value: formData.get("max_order_value") ? Number(formData.get("max_order_value")) : null,
    min_distance_km: formData.get("min_distance_km") ? Number(formData.get("min_distance_km")) : null,
    max_distance_km: formData.get("max_distance_km") ? Number(formData.get("max_distance_km")) : null,
    charge: Number(formData.get("charge") ?? 0),
    priority: Number(formData.get("priority") ?? 0),
    is_active: formData.get("is_active") === "on" || formData.get("is_active") === "true",
  };

  const { error } = await supabase.from("delivery_rules").update(data).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/delivery-rules");
}

export async function deleteDeliveryRule(id: string) {
  await assertPermission("delivery_rules", "delete");
  const supabase = createAdminClient();
  const { error } = await supabase.from("delivery_rules").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/delivery-rules");
}
