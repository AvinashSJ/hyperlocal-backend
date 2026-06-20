"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertPermission, PermissionError } from "@/lib/require-permission";

export type OrderStatus = "pending" | "confirmed" | "processing" | "shipped" | "delivered" | "cancelled" | "returned";
export type PaymentStatus = "unpaid" | "paid" | "refunded" | "partially_refunded";

type OrderRow = {
  id: string;
  order_number: string;
  user_id: string;
  status: OrderStatus;
  total_amount: number;
  payment_status: PaymentStatus;
  payment_method: string | null;
  delivery_date: string | null;
  placed_at: string;
  created_at: string;
};

export type OrderListItem = OrderRow & { profiles: { full_name: string | null; phone: string | null } | null };

export async function getOrders(storeId?: string | null) {
  const supabase = createAdminClient();
  let query = supabase
    .from("orders")
    .select("*, profiles(full_name, phone)")
    .order("placed_at", { ascending: false });
  if (storeId) query = query.eq("store_id", storeId);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as OrderListItem[];
}

export type OrderDetail = OrderRow & {
  subtotal: number;
  discount_amount: number;
  tax_amount: number;
  delivery_charge: number;
  gstin: string | null;
  profiles: { full_name: string | null; phone: string | null; email: string | null } | null;
  addresses: {
    full_name: string; phone: string; address_line1: string; address_line2: string | null;
    landmark: string | null; city: string; state: string; pincode: string;
  } | null;
  order_items: {
    id: string; product_id: string | null; variant_id: string | null; quantity: number;
    unit_price: number; total_price: number; gst_rate: number; gst_amount: number; status: string;
    // P26: snapshot fields survive product/variant deletion
    product_name: string | null;
    product_sku: string | null;
    variant_name: string | null;
    product_hsn_code: string | null;
    // Kept as fallback for legacy rows that have NULL snapshots
    products: { name: string; sku: string | null } | null;
    product_variants: { name: string } | null;
  }[];
  order_tracks: { id: string; status: string; notes: string | null; created_at: string }[];
};

export async function getOrder(id: string) {
  const supabase = createAdminClient();
  const { data: order, error } = await supabase
    .from("orders")
    // P26: include the snapshot columns (product_name, product_sku, variant_name,
    // product_hsn_code). The products JOIN is kept as a fallback for legacy rows
    // that have NULL snapshots.
    .select("*, profiles(full_name, phone, email), addresses(*), order_items(*, products(name, sku), product_variants(name)), order_tracks(*)")
    .eq("id", id)
    .single();
  if (error) throw new Error(error.message);
  return order as OrderDetail;
}

export async function updateOrderStatus(id: string, status: OrderStatus, notes?: string) {
  await assertPermission("orders", "edit");
  const supabase = createAdminClient();
  const updateFields: Record<string, string | null> = { status };

  if (status === "confirmed") updateFields.confirmed_at = new Date().toISOString();
  if (status === "delivered") updateFields.delivered_at = new Date().toISOString();

  const { error: updateError } = await supabase.from("orders").update(updateFields).eq("id", id);
  if (updateError) throw new Error(updateError.message);

  const { error: trackError } = await supabase.from("order_tracks").insert({
    order_id: id,
    status,
    notes: notes || null,
  });
  if (trackError) throw new Error(trackError.message);

  revalidatePath("/orders");
  revalidatePath(`/orders/${id}`);
}

export async function updatePaymentStatus(id: string, payment_status: PaymentStatus) {
  await assertPermission("orders", "edit");
  const supabase = createAdminClient();
  const { error } = await supabase.from("orders").update({ payment_status }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/orders");
  revalidatePath(`/orders/${id}`);
}

export async function deleteOrder(id: string) {
  const result = await assertPermission("orders", "delete");
  if (!result.isSuperAdmin) {
    throw new PermissionError("orders", "delete");
  }
  const supabase = createAdminClient();
  await supabase.from("order_tracks").delete().eq("order_id", id);
  await supabase.from("order_items").delete().eq("order_id", id);
  await supabase.from("invoices").delete().eq("order_id", id);
  const { error } = await supabase.from("orders").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/orders");
}
