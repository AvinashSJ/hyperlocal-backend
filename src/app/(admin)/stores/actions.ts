"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertPermission } from "@/lib/require-permission";
import { getProducts } from "@/app/(admin)/products/actions";
import type { Product } from "@/lib/types/supabase";

export type StoreRow = {
  id: string;
  name: string;
  slug: string;
  // P43: short unique code used for per-store invoice numbering
  // (INV-{code}-{year}-{seq}). 4-16 chars, uppercase letters/digits/_.
  code: string;
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

/**
 * P49: A row in the per-store drill-down modal. The shape is what
 * `getStoreRelations` returns for the customers list. We don't reuse
 * the full `CustomerUser` from `customers/actions.ts` because the modal
 * only needs a thin projection (name, contact info, order count) —
 * loading addresses and order aggregations would be wasteful for a
 * 10-row modal section.
 */
export type StoreCustomerRow = {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  order_count: number;
};

/**
 * P49: The shape returned by `getStoreRelations(id)` for the store
 * drill-down modal. Each section has both a count and a top-N list
 * so the modal can render summary cards + small tables.
 */
export type StoreRelations = {
  // Preexisting counts (kept for back-compat with the test suite).
  zones: number;
  gstNumbers: number;
  // New sections. Each has a total count and a top-N list.
  orderCount: number;
  orders: {
    id: string;
    order_number: string;
    user_id: string;
    total_amount: number;
    status: string;
    placed_at: string;
    customer_name: string | null;
  }[];
  customerCount: number;
  customers: StoreCustomerRow[];
  invoiceCount: number;
  invoices: {
    id: string;
    invoice_number: string;
    order_id: string;
    order_number: string | null;
    total_amount: number;
    status: string;
    created_at: string;
  }[];
  productCount: number;
  products: Product[];
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

/**
 * P49: Fetches counts + top-N lists for a store's related data.
 *
 * Sections:
 *   - orders:    recent 10 (most-recent first)
 *   - customers: top 10 by order count at this store
 *   - invoices:  recent 10 (most-recent first)
 *   - products:  first 20 (alphabetical)
 *
 * All 6 counts and 4 lists fire in parallel via Promise.all. The
 * customers query is the only one with non-trivial logic (it groups
 * orders by user_id in JS to find the top 10 by order count). The
 * others are single queries with .limit() / .order().
 *
 * Permission: this is a read-only query used by the store view
 * modal. Caller is responsible for any auth check; we don't gate
 * here so the helper is reusable in any Super Admin context.
 */
export async function getStoreRelations(id: string): Promise<StoreRelations> {
  const supabase = createAdminClient();

  // Fire all counts + lists in parallel. The 4 list queries are
  // the visible sections; the 4 count queries power the summary cards.
  const [
    zonesRes,
    gstRes,
    orderCountRes,
    ordersRes,
    invoiceCountRes,
    invoicesRes,
    productCountRes,
    products,
    ordersForCustomersRes,
  ] = await Promise.all([
    // Preexisting counts.
    supabase.from("delivery_zones").select("id", { count: "exact", head: true }).eq("store_id", id),
    supabase.from("gst_numbers").select("id", { count: "exact", head: true }).eq("store_id", id),
    // Orders.
    supabase.from("orders").select("id", { count: "exact", head: true }).eq("store_id", id),
    supabase
      .from("orders")
      .select("id, order_number, user_id, total_amount, status, placed_at, profiles(full_name)")
      .eq("store_id", id)
      .order("placed_at", { ascending: false })
      .limit(10),
    // Invoices.
    supabase
      .from("invoices")
      .select("id, orders!invoices_order_id_fkey!inner(store_id)", { count: "exact", head: true })
      .eq("orders.store_id", id),
    supabase
      .from("invoices")
      .select("id, invoice_number, order_id, total_amount, status, created_at, orders!invoices_order_id_fkey(order_number)")
      .eq("orders.store_id", id)
      .order("created_at", { ascending: false })
      .limit(10),
    // Products.
    supabase.from("products").select("id", { count: "exact", head: true }).eq("store_id", id),
    // The full product list (already limited to 100 in getProducts).
    getProducts(id),
    // Orders-for-customers: we need the user_ids at this store to
    // dedup + count. We fetch the user_id column only (small payload)
    // and cap at 1000 to prevent runaway on a busy store.
    supabase
      .from("orders")
      .select("user_id")
      .eq("store_id", id)
      .limit(1000),
  ]);

  // Build the top-10 customers by order count. The user_ids query
  // returns rows in arbitrary order; we count in JS.
  const counts = new Map<string, number>();
  for (const row of ordersForCustomersRes.data ?? []) {
    counts.set(row.user_id, (counts.get(row.user_id) ?? 0) + 1);
  }
  const topUserIds = Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([userId]) => userId);

  // Fetch the profile rows for those top users.
  let customers: StoreCustomerRow[] = topUserIds.map((userId) => ({
    id: userId,
    full_name: null,
    email: null,
    phone: null,
    order_count: counts.get(userId) ?? 0,
  }));

  if (topUserIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name, email, phone")
      .in("id", topUserIds);

    const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]));
    customers = topUserIds.map((userId) => {
      const profile = profileMap.get(userId);
      return {
        id: userId,
        full_name: profile?.full_name ?? null,
        email: profile?.email ?? null,
        phone: profile?.phone ?? null,
        order_count: counts.get(userId) ?? 0,
      };
    });
  }

  return {
    zones: zonesRes.count ?? 0,
    gstNumbers: gstRes.count ?? 0,
    orderCount: orderCountRes.count ?? 0,
    orders: ((ordersRes.data ?? []) as unknown as {
      id: string;
      order_number: string;
      user_id: string;
      total_amount: number;
      status: string;
      placed_at: string;
      profiles: { full_name: string | null } | null;
    }[]).map((o) => ({
      id: o.id,
      order_number: o.order_number,
      user_id: o.user_id,
      total_amount: Number(o.total_amount),
      status: o.status,
      placed_at: o.placed_at,
      customer_name: o.profiles?.full_name ?? null,
    })),
    customerCount: counts.size,
    customers,
    invoiceCount: invoiceCountRes.count ?? 0,
    invoices: ((invoicesRes.data ?? []) as unknown as {
      id: string;
      invoice_number: string;
      order_id: string;
      total_amount: number;
      status: string;
      created_at: string;
      orders: { order_number: string } | null;
    }[]).map((i) => ({
      id: i.id,
      invoice_number: i.invoice_number,
      order_id: i.order_id,
      order_number: i.orders?.order_number ?? null,
      total_amount: Number(i.total_amount),
      status: i.status,
      created_at: i.created_at,
    })),
    productCount: productCountRes.count ?? 0,
    products: products ?? [],
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
