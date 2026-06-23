"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertPermission, PermissionError } from "@/lib/require-permission";
import { generateInvoice } from "@/app/(admin)/invoices/actions";

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
  // P43: the store this order belongs to. NULL for legacy orders
  // (P40b) or orders placed before stores existed. Renders as
  // "No store" in the UI.
  store_id: string | null;
  // P39: the generated invoice's id, if any. Used to drive the
  // "Download Invoice" button on the order detail page.
  invoice_id: string | null;
};

export type OrderListItem = OrderRow & {
  profiles: { full_name: string | null; phone: string | null } | null;
  // P43: store info. NULL for legacy orders with no store_id.
  stores: { name: string; code: string } | null;
};

export async function getOrders(storeId?: string | null) {
  const supabase = createAdminClient();
  let query = supabase
    .from("orders")
    // P43: join with stores so the list page can show which store the
    // order belongs to. The join is `stores!orders_store_id_fkey` to
    // match the FK column name (orders.store_id references stores.id).
    .select("*, profiles(full_name, phone), stores!orders_store_id_fkey(name, code)")
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
  // P43: store info for the order detail page.
  stores: { name: string; code: string } | null;
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
    // P43: also join with stores(name, code) so the order detail page
    // can show which store the order belongs to.
    .select("*, profiles(full_name, phone, email), stores!orders_store_id_fkey(name, code), addresses(*), order_items(*, products(name, sku), product_variants(name)), order_tracks(*)")
    .eq("id", id)
    .single();
  if (error) throw new Error(error.message);
  return order as OrderDetail;
}

export async function updateOrderStatus(
  id: string,
  status: OrderStatus,
  notes?: string,
): Promise<{ invoiceId: string | null }> {
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

  // P44: auto-generate the invoice when the order transitions to
  // "delivered". Idempotent — if the order already has an
  // invoice_id, skip silently. Errors here are caught and logged
  // so a failed invoice generation never blocks a successful
  // status update (the manager can retry from the safety-net
  // "Generate Invoice" button on the order detail page).
  let invoiceId: string | null = null;
  if (status === "delivered") {
    try {
      invoiceId = await maybeGenerateInvoiceForDeliveredOrder(id, supabase);
    } catch (err) {
      console.error(
        `[updateOrderStatus] failed to auto-generate invoice for delivered order ${id}:`,
        (err as Error).message,
      );
    }
  }

  revalidatePath("/orders");
  revalidatePath(`/orders/${id}`);
  if (invoiceId) revalidatePath(`/invoices/${invoiceId}`);
  return { invoiceId };
}

/**
 * P44: helper that re-checks the order's current invoice_id and
 * generates one if missing. Extracted so the safety-net
 * generateInvoiceForOrder action and the auto-generation path
 * can share the same idempotency logic.
 *
 * @param supabase  the admin client (passed in for testability)
 * @returns the new invoice id, or null if the order already has one
 * @throws re-throws generateInvoice errors so the caller can decide
 *         whether to surface them
 */
async function maybeGenerateInvoiceForDeliveredOrder(
  orderId: string,
  supabase: ReturnType<typeof createAdminClient>,
): Promise<string | null> {
  // Re-fetch the order to get the current invoice_id (the UPDATE
  // above didn't .select() it back).
  const { data: current, error: fetchError } = await supabase
    .from("orders")
    .select("invoice_id, status")
    .eq("id", orderId)
    .single();
  if (fetchError) throw new Error(fetchError.message);
  if (current?.invoice_id) return null; // already has an invoice — skip
  return await generateInvoice(orderId);
}

/**
 * P44: manual safety-net for orders that are delivered but have no
 * invoice. Used when the auto-generation on delivery failed (e.g.,
 * the order's store was hard-deleted between placement and delivery)
 * or for backfilling older delivered orders.
 *
 * Idempotency guard: rejects if the order is not in 'delivered'
 * status, or if it already has an invoice. Returns the new
 * invoice id on success.
 */
export async function generateInvoiceForOrder(
  orderId: string,
): Promise<{ invoiceId: string }> {
  await assertPermission("invoices", "create");
  const supabase = createAdminClient();

  // Idempotency / preconditions.
  const { data: order, error: orderError } = await supabase
    .from("orders")
    .select("status, invoice_id")
    .eq("id", orderId)
    .single();
  if (orderError) throw new Error(orderError.message);
  if (!order) throw new Error("Order not found");
  if (order.status !== "delivered") {
    throw new Error("Invoice can only be generated for delivered orders");
  }
  if (order.invoice_id) {
    throw new Error("Order already has an invoice");
  }

  const invoiceId = await generateInvoice(orderId);

  revalidatePath("/orders");
  revalidatePath(`/orders/${orderId}`);
  revalidatePath(`/invoices/${invoiceId}`);
  revalidatePath("/invoices");
  return { invoiceId };
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
