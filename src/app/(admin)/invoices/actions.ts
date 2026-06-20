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
  orders: { order_number: string; user_id: string; profiles: { full_name: string | null } | null } | null;
};

export type InvoiceListItem = InvoiceRow;

export async function getInvoices(storeId?: string | null) {
  const supabase = createAdminClient();
  let query = supabase
    .from("invoices")
    .select("*, orders!invoices_order_id_fkey!inner(store_id, order_number, user_id, profiles(full_name))")
    .order("created_at", { ascending: false });
  if (storeId) query = query.eq("orders.store_id", storeId);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as InvoiceListItem[];
}

export type InvoiceDetail = InvoiceRow & {
  orders: {
    order_number: string;
    placed_at: string;
    gstin: string | null;
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
};

export async function getInvoice(id: string) {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("invoices")
    // P26: the order_items SELECT now reads the snapshot columns directly.
    // The products JOIN is kept as a fallback for legacy rows (placed before
    // the migration) where the snapshot is NULL.
    .select("*, orders!invoices_order_id_fkey(order_number, placed_at, gstin, profiles(full_name, phone), addresses(*), order_items(*, products(name, hsn_code, gst_rate), product_variants(name)))")
    .eq("id", id)
    .single();
  if (error) throw new Error(error.message);
  return data as InvoiceDetail;
}

export async function generateInvoice(orderId: string) {
  await assertPermission("invoices", "create");
  const supabase = createAdminClient();

  const { data: order, error: orderError } = await supabase
    .from("orders")
    .select("*, order_items(*, products(name, hsn_code, gst_rate), product_variants(name)), profiles(full_name, phone)")
    .eq("id", orderId)
    .single();
  if (orderError) throw new Error(orderError.message);

  const invCount = await supabase.from("invoices").select("id", { count: "exact", head: true });
  const invNum = `INV-${new Date().getFullYear()}-${String((invCount.count ?? 0) + 1).padStart(4, "0")}`;

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
