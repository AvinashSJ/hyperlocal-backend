"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { assertPermission } from "@/lib/require-permission";
import { getStoreScope } from "@/lib/store-scope";

/**
 * P54: Cart group — a single customer checkout that contains products
 * from N distinct stores. The Flutter app splits the cart into N
 * orders at checkout, all sharing the same `cart_id`. This action
 * fetches all orders under one cart_id, plus the customer info,
 * delivery address, and per-order stores/invoice links.
 *
 * Role-based scoping (matches /orders/page.tsx):
 *   - Super Admin: sees all sub-orders.
 *   - Manager / Staff: sees only sub-orders whose store matches
 *     their `profile.store_id`. They never see sub-orders belonging
 *     to other stores in the same cart — those rows are filtered
 *     server-side.
 *   - Anonymous: throws PermissionError.
 *
 * Returns null if the cart_id has zero visible orders (e.g., the
 * cart has no orders, or the caller's role can only see other
 * stores' orders). The page renders a "not found" state.
 */
export type CartGroupOrder = {
  id: string;
  order_number: string;
  status:
    | "pending"
    | "confirmed"
    | "processing"
    | "shipped"
    | "delivered"
    | "cancelled"
    | "returned";
  payment_status: "unpaid" | "paid" | "refunded" | "partially_refunded";
  payment_method: string | null;
  subtotal: number;
  discount_amount: number;
  tax_amount: number;
  delivery_charge: number;
  total_amount: number;
  placed_at: string;
  store_id: string | null;
  invoice_id: string | null;
  item_count: number;
  stores: { name: string; code: string } | null;
};

export type CartGroup = {
  cart_id: string;
  customer: {
    full_name: string | null;
    phone: string | null;
    email: string | null;
  } | null;
  delivery_address: {
    full_name: string;
    phone: string;
    address_line1: string;
    address_line2: string | null;
    landmark: string | null;
    city: string;
    state: string;
    pincode: string;
  } | null;
  delivery_slot_id: string | null;
  delivery_date: string | null;
  payment_method: string | null;
  placed_at: string;
  orders: CartGroupOrder[];
  total: number;
};

export async function getCartGroup(cartId: string): Promise<CartGroup | null> {
  await assertPermission("orders", "view");
  const supabase = createAdminClient();

  // Resolve the caller's store scope so we can filter out other
  // stores' sub-orders for non-Super-Admin callers. Super Admin
  // gets `storeScope.storeId === null`, which we treat as "no filter".
  const storeScope = await getStoreScope();

  // Fetch all orders under this cart_id. We use `select(*, order_items(id), stores(...))`
  // — order_items(id) is just for the count via the relation resolver.
  // The `order_items` join is a 1:N so the result is one row per
  // (order, item) pair; we aggregate back to one row per order in JS.
  let query = supabase
    .from("orders")
    .select(
      "id, order_number, status, payment_status, payment_method, subtotal, discount_amount, tax_amount, delivery_charge, total_amount, placed_at, store_id, invoice_id, user_id, delivery_address_id, delivery_slot_id, delivery_date, order_items(id), profiles(full_name, phone, email), stores!orders_store_id_fkey(name, code), addresses(*)",
    )
    .eq("cart_id", cartId)
    .order("placed_at", { ascending: true });

  // Manager / Staff can only see their own store's sub-orders.
  if (storeScope.storeId) {
    query = query.eq("store_id", storeScope.storeId);
  }

  const { data: rows, error } = await query;
  if (error) throw new Error(error.message);
  if (!rows || rows.length === 0) return null;

  // Aggregate (order, item) rows back to one row per order. PostgREST
  // expands the 1:N order_items join into N duplicate rows (one per
  // item), so the same order id appears multiple times. We dedup on
  // the first occurrence AND accumulate the item_count across all
  // duplicates so the count is correct.
  const orderMap = new Map<string, CartGroupOrder>();
  for (const row of rows as unknown as Array<{
    id: string;
    order_number: string;
    status: CartGroupOrder["status"];
    payment_status: CartGroupOrder["payment_status"];
    payment_method: string | null;
    subtotal: number;
    discount_amount: number;
    tax_amount: number;
    delivery_charge: number;
    total_amount: number;
    placed_at: string;
    store_id: string | null;
    invoice_id: string | null;
    order_items: { id: string }[] | null;
    stores: { name: string; code: string } | null;
  }>) {
    const existing = orderMap.get(row.id);
    const rowItemCount = row.order_items?.length ?? 0;
    if (existing) {
      existing.item_count += rowItemCount;
      continue;
    }
    orderMap.set(row.id, {
      id: row.id,
      order_number: row.order_number,
      status: row.status,
      payment_status: row.payment_status,
      payment_method: row.payment_method,
      subtotal: Number(row.subtotal),
      discount_amount: Number(row.discount_amount),
      tax_amount: Number(row.tax_amount),
      delivery_charge: Number(row.delivery_charge),
      total_amount: Number(row.total_amount),
      placed_at: row.placed_at,
      store_id: row.store_id,
      invoice_id: row.invoice_id,
      item_count: rowItemCount,
      stores: row.stores,
    });
  }

  const orders = Array.from(orderMap.values());

  // Customer + address info is the same across all sub-orders
  // (the Flutter app sets the same delivery_address_id, user_id,
  // delivery_slot_id, delivery_date, payment_method for all N
  // orders in a cart). Pull from the first order.
  const firstRow = rows[0] as unknown as {
    profiles: { full_name: string | null; phone: string | null; email: string | null } | null;
    addresses: CartGroup["delivery_address"];
    delivery_slot_id: string | null;
    delivery_date: string | null;
    payment_method: string | null;
    placed_at: string;
  };
  const total = orders.reduce((sum, o) => sum + o.total_amount, 0);

  return {
    cart_id: cartId,
    customer: firstRow.profiles
      ? {
          full_name: firstRow.profiles.full_name,
          phone: firstRow.profiles.phone,
          email: firstRow.profiles.email,
        }
      : null,
    delivery_address: firstRow.addresses ?? null,
    delivery_slot_id: firstRow.delivery_slot_id,
    delivery_date: firstRow.delivery_date,
    payment_method: firstRow.payment_method,
    placed_at: firstRow.placed_at,
    orders,
    total,
  };
}
