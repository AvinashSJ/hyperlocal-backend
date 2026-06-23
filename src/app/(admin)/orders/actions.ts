"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertPermission, PermissionError } from "@/lib/require-permission";
import { logActivity } from "@/lib/activity-log";
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

  // P50: capture the previous status BEFORE the update so the
  // activity_log can show "pending → cancelled" etc. for forensic
  // review. Only fetched for the high-signal status changes
  // (cancelled/returned) — routine transitions are noise.
  let previousStatus: string | null = null;
  if (status === "cancelled" || status === "returned") {
    const { data: prev } = await supabase
      .from("orders")
      .select("status")
      .eq("id", id)
      .maybeSingle();
    previousStatus = prev?.status ?? null;
  }

  const { error: updateError } = await supabase.from("orders").update(updateFields).eq("id", id);
  if (updateError) throw new Error(updateError.message);

  const { error: trackError } = await supabase.from("order_tracks").insert({
    order_id: id,
    status,
    notes: notes || null,
  });
  if (trackError) throw new Error(trackError.message);

  // P50: log high-signal status transitions (cancellation / return).
  // These are the money-affecting events that ops / customer support
  // will need to investigate later. Routine status changes
  // (pending → confirmed → shipped → delivered) are intentionally NOT
  // logged here — the order_tracks table already records the full
  // history for those.
  if (status === "cancelled" || status === "returned") {
    await logActivity({
      action: "update",
      entityType: "order",
      entityId: id,
      details: {
        action_type: `status_${status}`,
        previous_status: previousStatus,
        new_status: status,
        notes: notes ?? null,
      },
    });
  }

  // P44: auto-generate the invoice when the order transitions to
  // "delivered". Idempotent — if the order already has an
  // invoice_id, skip silently. Errors here are caught and logged
  // so a failed invoice generation never blocks a successful
  // status update. If the invoice is missing after this, the
  // operator can create one via the Invoices module's underlying
  // generateInvoice function (e.g., from a one-off script).
  let invoiceId: string | null = null;
  if (status === "delivered") {
    try {
      // Re-fetch the order to get the current invoice_id (the
      // UPDATE above didn't .select() it back).
      const { data: current, error: fetchError } = await supabase
        .from("orders")
        .select("invoice_id")
        .eq("id", id)
        .single();
      if (fetchError) throw new Error(fetchError.message);
      if (!current?.invoice_id) {
        invoiceId = await generateInvoice(id);
      }
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

  // P50: capture identifying fields BEFORE the delete so the
  // activity_log row remains useful for forensics (the row itself
  // is gone by the time we'd query for it). Best-effort — if the
  // select fails we still proceed with the delete and log a
  // minimal details payload.
  const { data: orderRow } = await supabase
    .from("orders")
    .select("order_number, store_id")
    .eq("id", id)
    .maybeSingle();
  const orderNumber = orderRow?.order_number ?? null;
  const storeId = orderRow?.store_id ?? null;

  await supabase.from("order_tracks").delete().eq("order_id", id);
  await supabase.from("order_items").delete().eq("order_id", id);
  await supabase.from("invoices").delete().eq("order_id", id);
  const { error } = await supabase.from("orders").delete().eq("id", id);
  if (error) throw new Error(error.message);

  await logActivity({
    action: "delete",
    entityType: "order",
    entityId: id,
    details: {
      order_number: orderNumber,
      store_id: storeId,
    },
  });

  revalidatePath("/orders");
}
