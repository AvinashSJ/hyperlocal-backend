"use server";

import { createAdminClient } from "@/lib/supabase/admin";

export async function getInventoryLogs(storeId?: string | null) {
  const supabase = createAdminClient();
  let query = supabase
    .from("inventory_log")
    .select("*, products!inner(name, store_id), product_variants(name)")
    .order("created_at", { ascending: false });
  if (storeId) query = query.eq("products.store_id", storeId);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data ?? [];
}
