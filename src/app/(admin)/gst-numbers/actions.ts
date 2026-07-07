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

// P64: Indian GSTIN is 15 chars: 2-digit state + 10-char PAN + 1 entity
// letter + 'Z' + 1 check digit. Example: 29ABCDE1234F1Z5.
const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

// These helpers are exported but must be async because the file has
// "use server" — Next.js requires every direct export from a "use
// server" file to be an async function. The throw/console.warn
// behavior is preserved; callers just need to `await` them.
export async function validateGstin(gstin: string): Promise<void> {
  if (!gstin) throw new Error("GSTIN is required");
  if (!GSTIN_REGEX.test(gstin)) {
    throw new Error("GSTIN must be a valid 15-character Indian GSTIN (e.g. 29ABCDE1234F1Z5)");
  }
}

export async function warnGstinStateMismatch(gstin: string, stateCode: string): Promise<void> {
  if (!gstin || !stateCode) return;
  const gstinState = gstin.slice(0, 2);
  if (gstinState !== stateCode) {
    // Soft warn via console — does not throw. GST is sometimes registered
    // with a different state than the store's physical address.
    // eslint-disable-next-line no-console
    console.warn(
      `[gst-numbers] GSTIN state code "${gstinState}" does not match provided state_code "${stateCode}"`,
    );
  }
}

export async function demoteOtherPrimaries(storeId: string | null, excludeId: string | null): Promise<void> {
  if (!storeId) return;
  const supabase = createAdminClient();
  const { error } = await supabase.rpc("demote_other_primaries", {
    p_store_id: storeId,
    p_exclude_id: excludeId,
  });
  if (error) {
    // Non-fatal: log and continue. Worst case the new primary coexists with
    // an old one, which is the same pre-P64 behavior.
    // eslint-disable-next-line no-console
    console.warn(`[gst-numbers] demote_other_primaries RPC failed: ${error.message}`);
  }
}

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

// P65: lightweight read used by /stores list (view modal) and
// /stores/[id] (detail page). Returns only the primary GSTIN for a
// store, or null. Avoids the full list payload.
export async function getPrimaryGstin(storeId: string): Promise<{
  gstin: string;
  legal_name: string;
  state_code: string | null;
} | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("gst_numbers")
    .select("gstin, legal_name, state_code")
    .eq("store_id", storeId)
    .eq("is_primary", true)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ?? null;
}

export async function createGstNumber(formData: FormData) {
  await assertPermission("gst_numbers", "create");
  const supabase = createAdminClient();
  const data: GstNumberInput = {
    store_id: String(formData.get("store_id") ?? ""),
    gstin: String(formData.get("gstin") ?? "").toUpperCase(),
    legal_name: String(formData.get("legal_name") ?? ""),
    business_address: String(formData.get("business_address") ?? ""),
    state_code: String(formData.get("state_code") ?? ""),
    is_primary: formData.get("is_primary") === "on" || formData.get("is_primary") === "true",
    is_active: formData.get("is_active") === "on" || formData.get("is_active") === "true",
    current_turnover: Number(formData.get("current_turnover") ?? 0),
    financial_year: String(formData.get("financial_year") ?? ""),
    threshold_amount: Number(formData.get("threshold_amount") ?? 0),
  };
  await validateGstin(data.gstin);
  if (!data.store_id) throw new Error("Store is required");
  await warnGstinStateMismatch(data.gstin, data.state_code);

  // P64: ensure only one primary per store. Demote any existing primary
  // before inserting the new one.
  if (data.is_primary) {
    await demoteOtherPrimaries(data.store_id || null, null);
  }

  const { error } = await supabase.from("gst_numbers").insert(data);
  if (error) throw new Error(error.message);
  revalidatePath("/gst-numbers");
}

export async function updateGstNumber(id: string, formData: FormData) {
  await assertPermission("gst_numbers", "edit");
  const supabase = createAdminClient();
  const data: GstNumberInput = {
    store_id: String(formData.get("store_id") ?? ""),
    gstin: String(formData.get("gstin") ?? "").toUpperCase(),
    legal_name: String(formData.get("legal_name") ?? ""),
    business_address: String(formData.get("business_address") ?? ""),
    state_code: String(formData.get("state_code") ?? ""),
    is_primary: formData.get("is_primary") === "on" || formData.get("is_primary") === "true",
    is_active: formData.get("is_active") === "on" || formData.get("is_active") === "true",
    current_turnover: Number(formData.get("current_turnover") ?? 0),
    financial_year: String(formData.get("financial_year") ?? ""),
    threshold_amount: Number(formData.get("threshold_amount") ?? 0),
  };
  await validateGstin(data.gstin);
  await warnGstinStateMismatch(data.gstin, data.state_code);

  // P64: ensure only one primary per store. Demote any other primary
  // (excluding this row) before updating to is_primary=true.
  if (data.is_primary) {
    await demoteOtherPrimaries(data.store_id || null, id);
  }

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

// P67: attach an orphan GST number (store_id IS NULL) to a store.
// Forced is_primary=false on attach: orphan rows must be promoted
// manually to primary, never auto-promoted. Refuses to attach if
// the row is not currently an orphan (defense against double-click
// or stale UI).
export async function attachGstNumberToStore(gstId: string, storeId: string) {
  await assertPermission("gst_numbers", "edit");
  if (!gstId) throw new Error("GST number id is required");
  if (!storeId) throw new Error("Store id is required");
  const supabase = createAdminClient();

  // Confirm the row is currently an orphan
  const { data: row, error: fetchError } = await supabase
    .from("gst_numbers")
    .select("id, store_id")
    .eq("id", gstId)
    .maybeSingle();
  if (fetchError) throw new Error(fetchError.message);
  if (!row) throw new Error("GST number not found");
  if (row.store_id !== null) {
    throw new Error("This GST number is already attached to a store");
  }

  const { error: updateError } = await supabase
    .from("gst_numbers")
    .update({ store_id: storeId, is_primary: false })
    .eq("id", gstId);
  if (updateError) throw new Error(updateError.message);
  revalidatePath("/gst-numbers");
}

// P67: list of stores for the "Attach to store" dropdown. Excludes
// inactive stores. Returns id + name + code for compact display.
export async function getStoresForGstAttach(): Promise<
  { id: string; name: string; code: string }[]
> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("stores")
    .select("id, name, code")
    .eq("is_active", true)
    .order("name", { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}
