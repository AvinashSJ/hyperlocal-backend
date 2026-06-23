"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertPermission } from "@/lib/require-permission";

type InvoiceRow = {
  id: string;
  order_id: string;
  invoice_number: string;
  invoice_type: string;
  taxable_amount: number;
  cgst: number | null;
  sgst: number | null;
  igst: number | null;
  total_amount: number;
  amount_in_words: string | null;
  status: string;
  pdf_url: string | null;
  invoice_date: string;
  created_at: string;
  // P43: also join with stores(name, code) so the list page can show
  // which store each invoice belongs to. The store_id is on the order
  // (orders.store_id); we join through it.
  orders: {
    order_number: string;
    user_id: string;
    store_id: string | null;
    profiles: { full_name: string | null } | null;
    stores: { name: string; code: string } | null;
  } | null;
};

export type InvoiceListItem = InvoiceRow;

export async function getInvoices(storeId?: string | null) {
  const supabase = createAdminClient();
  let query = supabase
    .from("invoices")
    // P43: also join with stores(name, code) through the order so
    // the list page can show which store the invoice belongs to.
    .select("*, orders!invoices_order_id_fkey!inner(store_id, order_number, user_id, profiles(full_name), stores!orders_store_id_fkey(name, code))")
    .order("created_at", { ascending: false });
  if (storeId) query = query.eq("orders.store_id", storeId);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as InvoiceListItem[];
}

export type InvoiceStore = {
  name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  phone: string | null;
  email: string | null;
  gstin: string | null;
  legal_name: string | null;
};

export type InvoiceDetail = InvoiceRow & {
  orders: {
    order_number: string;
    placed_at: string;
    gstin: string | null;
    store_id: string | null;
    profiles: { full_name: string | null; phone: string | null } | null;
    addresses: {
      full_name: string; phone: string; address_line1: string; address_line2: string | null;
      landmark: string | null; city: string; state: string; pincode: string;
    } | null;
    order_items: {
      id: string; quantity: number; unit_price: number; total_price: number;
      gst_rate: number; gst_amount: number;
      // P26: snapshot fields survive product/variant deletion
      product_name: string | null;
      product_sku: string | null;
      variant_name: string | null;
      product_hsn_code: string | null;
      // Legacy JOIN (fallback for rows placed before the migration)
      products: { name: string; hsn_code: string | null; gst_rate: number } | null;
      product_variants: { name: string } | null;
    }[];
  } | null;
  // P39: store + primary GSTIN enriched for the PDF. These are
  // computed in getInvoice (not part of the initial SELECT) so the
  // detail page and the PDF download API both get the same data
  // shape.
  store: InvoiceStore | null;
};

export async function getInvoice(id: string): Promise<InvoiceDetail> {
  // P39: hard permission check at the action level. The page
  // already calls requirePermission, but the API route (used by
  // the Download button) bypasses the page and goes straight to
  // the server action, so the check has to be here too. We use
  // assertPermission (throws PermissionError) rather than
  // requirePermission (redirects) so the API route can catch
  // the error and return a proper 403 JSON response.
  await assertPermission("invoices", "view");
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("invoices")
    // P26: the order_items SELECT now reads the snapshot columns directly.
    // The products JOIN is kept as a fallback for legacy rows (placed before
    // the migration) where the snapshot is NULL.
    .select("*, orders!invoices_order_id_fkey(order_number, placed_at, gstin, store_id, profiles(full_name, phone), addresses(*), order_items(*, products(name, hsn_code, gst_rate), product_variants(name)))")
    .eq("id", id)
    .single();
  if (error) throw new Error(error.message);

  const detail = data as InvoiceDetail;
  detail.store = await fetchInvoiceStore(detail.orders?.store_id ?? null);
  return detail;
}

/**
 * P39: enrich the invoice with the store's name/address + primary
 * GSTIN so the PDF can show real data instead of placeholders.
 * Returns null when the order has no store (legacy data).
 */
async function fetchInvoiceStore(storeId: string | null): Promise<InvoiceStore | null> {
  if (!storeId) return null;
  const supabase = createAdminClient();
  const { data: store } = await supabase
    .from("stores")
    .select("name, address, city, state, pincode, phone, email")
    .eq("id", storeId)
    .single();
  if (!store) return null;

  const { data: gstinRow } = await supabase
    .from("gst_numbers")
    .select("gstin, legal_name")
    .eq("store_id", storeId)
    .eq("is_primary", true)
    .eq("is_active", true)
    .maybeSingle();

  return {
    name: store.name,
    address: store.address,
    city: store.city,
    state: store.state,
    pincode: store.pincode,
    phone: store.phone,
    email: store.email,
    gstin: gstinRow?.gstin ?? null,
    legal_name: gstinRow?.legal_name ?? null,
  };
}

export async function generateInvoice(orderId: string) {
  await assertPermission("invoices", "create");
  const supabase = createAdminClient();

  const { data: order, error: orderError } = await supabase
    .from("orders")
    // P43: also join with stores(code) so we can compose the
    // per-store invoice number. The store's code column is NOT NULL
    // and unique (see migration 20260623000001_add_stores_code.sql).
    .select("*, order_items(*, products(name, hsn_code, gst_rate), product_variants(name)), profiles(full_name, phone), stores!orders_store_id_fkey(code)")
    .eq("id", orderId)
    .single();
  if (orderError) throw new Error(orderError.message);

  // P43: per-store invoice numbering. Each establishment has its own
  // yearly sequence: INV-{storeCode}-{year}-{seq}, e.g. INV-A1B2C3D4-2026-0001.
  //
  // For orders without a store (legacy / orphaned), fall back to a
  // global sequence "INV-ORPHAN-{year}-{seq}" so the invoice is still
  // generated and is clearly marked as orphaned.
  const year = new Date().getFullYear();
  const storeCode = (order as { stores?: { code?: string } | null }).stores?.code ?? null;
  let invNum: string;
  if (storeCode) {
    // Count invoices for THIS store + THIS year.
    const { count: storeCount } = await supabase
      .from("invoices")
      .select("id, orders!inner(store_id)", { count: "exact", head: true })
      .eq("orders.store_id", order.store_id)
      .like("invoice_number", `INV-${storeCode}-${year}-%`);
    invNum = `INV-${storeCode}-${year}-${String((storeCount ?? 0) + 1).padStart(4, "0")}`;
  } else {
    // Orphan fallback. The store was deleted or never set on this
    // order. Use a clearly-labeled global sequence so the operator
    // knows this invoice needs follow-up.
    const { count: orphanCount } = await supabase
      .from("invoices")
      .select("id", { count: "exact", head: true })
      .like("invoice_number", `INV-ORPHAN-${year}-%`);
    invNum = `INV-ORPHAN-${year}-${String((orphanCount ?? 0) + 1).padStart(4, "0")}`;
  }

  const taxableAmount = Number(order.total_amount) - Number(order.delivery_charge);
  const gstTotal = order.order_items.reduce((sum: number, item: { gst_amount: number }) => sum + Number(item.gst_amount), 0);
  const cgst = gstTotal / 2;
  const sgst = gstTotal / 2;

  const { data: invoice, error: invError } = await supabase
    .from("invoices")
    .insert({
      order_id: orderId,
      invoice_number: invNum,
      taxable_amount: taxableAmount,
      cgst,
      sgst,
      total_amount: Number(order.total_amount),
      status: "generated",
    })
    .select("id")
    .single();
  if (invError) throw new Error(invError.message);

  await supabase.from("orders").update({ invoice_id: invoice.id }).eq("id", orderId);

  revalidatePath("/invoices");
  revalidatePath(`/orders/${orderId}`);
  return invoice.id;
}
