"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertPermission } from "@/lib/require-permission";

export type StoreRow = {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  banner_url: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  delivery_radius_km: number | null;
  commission_rate: number | null;
  is_open: boolean;
  is_active: boolean;
  updated_at: string;
  created_at: string;
};

export async function getStores(): Promise<StoreRow[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("stores")
    .select("*")
    .order("name", { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getStoreRelations(id: string) {
  const supabase = createAdminClient();
  const [zonesRes, gstRes] = await Promise.all([
    supabase.from("delivery_zones").select("id", { count: "exact", head: true }).eq("store_id", id),
    supabase.from("gst_numbers").select("id", { count: "exact", head: true }).eq("store_id", id),
  ]);
  return {
    zones: zonesRes.count ?? 0,
    gstNumbers: gstRes.count ?? 0,
  };
}

export async function deleteStore(id: string) {
  await assertPermission("stores", "delete");
  const supabase = createAdminClient();

  const { data: store } = await supabase
    .from("stores")
    .select("is_active, updated_at")
    .eq("id", id)
    .single();

  if (!store) throw new Error("Store not found");
  if (store.is_active) throw new Error("Cannot delete an active store. Disable it first.");

  const daysSinceUpdate = (Date.now() - new Date(store.updated_at).getTime()) / (1000 * 60 * 60 * 24);
  if (daysSinceUpdate < 90) throw new Error("Store must be disabled for at least 90 days before deletion.");

  await supabase.from("delivery_zones").delete().eq("store_id", id);
  await supabase.from("gst_numbers").delete().eq("store_id", id);

  const { error } = await supabase.from("stores").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/stores");
}

export async function getStoreCategories(storeId: string) {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("store_categories")
    .select("category_id, categories(id, name)")
    .eq("store_id", storeId);
  return (data ?? []).map((sc) => (sc.categories as unknown) as { id: string; name: string });
}

export async function setStoreCategories(storeId: string, categoryIds: string[]) {
  await assertPermission("stores", "edit");
  const supabase = createAdminClient();
  await supabase.from("store_categories").delete().eq("store_id", storeId);
  if (categoryIds.length > 0) {
    const rows = categoryIds.map((category_id) => ({ store_id: storeId, category_id }));
    const { error } = await supabase.from("store_categories").insert(rows);
    if (error) throw new Error(error.message);
  }
  revalidatePath("/settings");
  revalidatePath("/stores");
}

export async function getEligibleManagers() {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("profiles")
    .select("id, full_name, email, role_id")
    .is("store_id", null);

  if (!data) return [];

  const roleIds = [...new Set(data.map((p) => p.role_id).filter(Boolean))];

  if (roleIds.length === 0) return [];

  const { data: roles } = await supabase
    .from("roles")
    .select("id, name")
    .in("id", roleIds);

  const managerRoleIds = new Set(
    (roles ?? []).filter((r) => r.name !== "Super Admin").map((r) => r.id),
  );

  return data
    .filter((p) => p.role_id && managerRoleIds.has(p.role_id))
    .map((p) => ({ id: p.id, full_name: p.full_name, email: p.email }));
}
