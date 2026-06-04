"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertPermission } from "@/lib/require-permission";

type GstNumberInput = {
  store_id: string;
  gstin: string;
  legal_name: string;
  business_address: string;
  state_code: string;
  is_primary: boolean;
  is_active: boolean;
  current_turnover: number;
  financial_year: string;
  threshold_amount: number;
};

export async function getGstNumbers(storeId?: string | null) {
  const supabase = createAdminClient();
  let query = supabase
    .from("gst_numbers")
    .select("*, stores(name)")
    .order("created_at", { ascending: false });
  if (storeId) query = query.eq("store_id", storeId);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function createGstNumber(formData: FormData) {
  await assertPermission("gst_numbers", "create");
  const supabase = createAdminClient();
  const data: GstNumberInput = {
    store_id: String(formData.get("store_id") ?? ""),
    gstin: String(formData.get("gstin") ?? ""),
    legal_name: String(formData.get("legal_name") ?? ""),
    business_address: String(formData.get("business_address") ?? ""),
    state_code: String(formData.get("state_code") ?? ""),
    is_primary: formData.get("is_primary") === "on" || formData.get("is_primary") === "true",
    is_active: formData.get("is_active") === "on" || formData.get("is_active") === "true",
    current_turnover: Number(formData.get("current_turnover") ?? 0),
    financial_year: String(formData.get("financial_year") ?? ""),
    threshold_amount: Number(formData.get("threshold_amount") ?? 0),
  };
  if (!data.gstin) throw new Error("GSTIN is required");
  if (!data.store_id) throw new Error("Store is required");

  const { error } = await supabase.from("gst_numbers").insert(data);
  if (error) throw new Error(error.message);
  revalidatePath("/gst-numbers");
}

export async function updateGstNumber(id: string, formData: FormData) {
  await assertPermission("gst_numbers", "edit");
  const supabase = createAdminClient();
  const data: GstNumberInput = {
    store_id: String(formData.get("store_id") ?? ""),
    gstin: String(formData.get("gstin") ?? ""),
    legal_name: String(formData.get("legal_name") ?? ""),
    business_address: String(formData.get("business_address") ?? ""),
    state_code: String(formData.get("state_code") ?? ""),
    is_primary: formData.get("is_primary") === "on" || formData.get("is_primary") === "true",
    is_active: formData.get("is_active") === "on" || formData.get("is_active") === "true",
    current_turnover: Number(formData.get("current_turnover") ?? 0),
    financial_year: String(formData.get("financial_year") ?? ""),
    threshold_amount: Number(formData.get("threshold_amount") ?? 0),
  };
  if (!data.gstin) throw new Error("GSTIN is required");

  const { error } = await supabase.from("gst_numbers").update(data).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/gst-numbers");
}

export async function deleteGstNumber(id: string) {
  await assertPermission("gst_numbers", "delete");
  const supabase = createAdminClient();
  const { error } = await supabase.from("gst_numbers").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/gst-numbers");
}
