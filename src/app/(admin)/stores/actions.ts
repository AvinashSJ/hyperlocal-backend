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

export type LockedCategory = {
  categoryId: string;
  reason: "products" | "orders" | "both";
  productCount: number;
  activeOrderCount: number;
};

const ACTIVE_ORDER_STATUSES = [
  "pending",
  "confirmed",
  "processing",
  "out_for_delivery",
] as const;

export async function getLockedStoreCategories(
  storeId: string,
): Promise<LockedCategory[]> {
  const supabase = createAdminClient();

  const [productsRes, ordersRes] = await Promise.all([
    supabase
      .from("products")
      .select("category_id", { count: "exact" })
      .eq("store_id", storeId)
      .not("category_id", "is", null),
    supabase
      .from("order_items")
      .select(
        "category_id, orders!inner(store_id, status)",
        { count: "exact" },
      )
      .eq("orders.store_id", storeId)
      .in("orders.status", ACTIVE_ORDER_STATUSES as unknown as string[])
      .not("category_id", "is", null),
  ]);

  const productCounts = new Map<string, number>();
  (productsRes.data ?? []).forEach((p) => {
    if (p.category_id) {
      productCounts.set(
        p.category_id,
        (productCounts.get(p.category_id) ?? 0) + 1,
      );
    }
  });

  const orderCounts = new Map<string, number>();
  (ordersRes.data ?? []).forEach((row) => {
    if (row.category_id) {
      orderCounts.set(
        row.category_id,
        (orderCounts.get(row.category_id) ?? 0) + 1,
      );
    }
  });

  const allCategoryIds = new Set<string>([
    ...productCounts.keys(),
    ...orderCounts.keys(),
  ]);

  return Array.from(allCategoryIds).map((categoryId) => {
    const productCount = productCounts.get(categoryId) ?? 0;
    const activeOrderCount = orderCounts.get(categoryId) ?? 0;
    const reason: LockedCategory["reason"] =
      productCount > 0 && activeOrderCount > 0
        ? "both"
        : productCount > 0
        ? "products"
        : "orders";
    return { categoryId, reason, productCount, activeOrderCount };
  });
}

export async function assertCategoriesRemovable(
  storeId: string,
  removedCategoryIds: string[],
) {
  if (removedCategoryIds.length === 0) return;
  const locked = await getLockedStoreCategories(storeId);
  const lockedMap = new Map(locked.map((l) => [l.categoryId, l]));

  const violations = removedCategoryIds
    .map((id) => lockedMap.get(id))
    .filter((v): v is LockedCategory => Boolean(v));

  if (violations.length === 0) return;

  const details = violations
    .map((v) => {
      const parts: string[] = [];
      if (v.productCount > 0) parts.push(`${v.productCount} product(s)`);
      if (v.activeOrderCount > 0)
        parts.push(`${v.activeOrderCount} active order(s)`);
      return parts.join(" and ");
    })
    .join("; ");

  throw new Error(
    `Cannot remove ${violations.length} categor${violations.length === 1 ? "y" : "ies"} from this store — ${details}. Move or close the related products/orders first.`,
  );
}

export async function setStoreCategories(storeId: string, categoryIds: string[]) {
  await assertPermission("stores", "edit");
  const supabase = createAdminClient();

  const { data: existing } = await supabase
    .from("store_categories")
    .select("category_id")
    .eq("store_id", storeId);
  const existingIds = new Set((existing ?? []).map((r) => r.category_id));
  const newIds = new Set(categoryIds);
  const removed = Array.from(existingIds).filter((id) => !newIds.has(id));

  await assertCategoriesRemovable(storeId, removed);

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
