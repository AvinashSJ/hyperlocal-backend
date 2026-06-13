"use server";

import { createAdminClient } from "@/lib/supabase/admin";

function dateFilter(
  q: any,
  start?: string | null,
  end?: string | null,
  column = "placed_at",
) {
  if (start) q = q.gte(column, start);
  if (end) q = q.lte(column, `${end}T23:59:59.999Z`);
  return q;
}

function storeFilter(q: any, storeId?: string | null) {
  if (storeId) q = q.eq("store_id", storeId);
  return q;
}

export type RevenueSummary = {
  totalRevenue: number;
  ordersCount: number;
  avgOrderValue: number;
  todayRevenue: number;
  todayOrders: number;
};

export async function getRevenueSummary(
  start?: string | null,
  end?: string | null,
  storeId?: string | null,
): Promise<RevenueSummary> {
  const supabase = createAdminClient();

  let q = supabase
    .from("orders")
    .select("total_amount")
    .eq("payment_status", "paid");
  q = dateFilter(q, start, end);
  q = storeFilter(q, storeId);
  const { data: paidOrders } = await q;

  const today = new Date().toISOString().slice(0, 10);
  let tq = supabase
    .from("orders")
    .select("total_amount")
    .eq("payment_status", "paid")
    .gte("placed_at", today);
  tq = storeFilter(tq, storeId);
  const { data: todayOrders } = await tq;

  const totalRevenue = (paidOrders ?? []).reduce((s, o) => s + Number(o.total_amount), 0);
  const ordersCount = paidOrders?.length ?? 0;
  const todayRevenue = (todayOrders ?? []).reduce((s, o) => s + Number(o.total_amount), 0);
  const todayOrdersCount = todayOrders?.length ?? 0;

  return {
    totalRevenue,
    ordersCount,
    avgOrderValue: ordersCount > 0 ? totalRevenue / ordersCount : 0,
    todayRevenue,
    todayOrders: todayOrdersCount,
  };
}

export type RevenueByStore = {
  store_name: string;
  total_revenue: number;
  orders_count: number;
  avg_order_value: number;
};

export async function getRevenueByStore(
  start?: string | null,
  end?: string | null,
): Promise<RevenueByStore[]> {
  const supabase = createAdminClient();

  let q = supabase
    .from("orders")
    .select("total_amount, store_id, stores(name)")
    .eq("payment_status", "paid");
  q = dateFilter(q, start, end);
  const { data } = await q;

  const map = new Map<string, { name: string; total: number; count: number }>();
  for (const o of data ?? []) {
    const id = o.store_id ?? "unknown";
    const entry = map.get(id) ?? { name: (o.stores as any)?.name ?? "Unknown", total: 0, count: 0 };
    entry.total += Number(o.total_amount);
    entry.count += 1;
    map.set(id, entry);
  }

  return Array.from(map.entries())
    .map(([_, v]) => ({
      store_name: v.name,
      total_revenue: v.total,
      orders_count: v.count,
      avg_order_value: v.count > 0 ? v.total / v.count : 0,
    }))
    .sort((a, b) => b.total_revenue - a.total_revenue);
}

export type RevenueByMethod = {
  payment_method: string;
  total_revenue: number;
  orders_count: number;
};

export async function getRevenueByMethod(
  start?: string | null,
  end?: string | null,
  storeId?: string | null,
): Promise<RevenueByMethod[]> {
  const supabase = createAdminClient();

  let q = supabase
    .from("orders")
    .select("total_amount, payment_method")
    .eq("payment_status", "paid");
  q = dateFilter(q, start, end);
  q = storeFilter(q, storeId);
  const { data } = await q;

  const map = new Map<string, { total: number; count: number }>();
  for (const o of data ?? []) {
    const method = o.payment_method ?? "unknown";
    const entry = map.get(method) ?? { total: 0, count: 0 };
    entry.total += Number(o.total_amount);
    entry.count += 1;
    map.set(method, entry);
  }

  const labels: Record<string, string> = {
    cod: "Cash on Delivery",
    pay_at_pickup: "Pay at Pickup",
    card: "Card",
    upi: "UPI",
    netbanking: "Net Banking",
    wallet: "Wallet",
    unknown: "Unknown",
  };

  return Array.from(map.entries())
    .map(([k, v]) => ({
      payment_method: labels[k] ?? k,
      total_revenue: v.total,
      orders_count: v.count,
    }))
    .sort((a, b) => b.total_revenue - a.total_revenue);
}

export type MonthlyRevenue = {
  month: string;
  year: number;
  total_revenue: number;
  orders_count: number;
};

export async function getMonthlyRevenue(
  start?: string | null,
  end?: string | null,
  storeId?: string | null,
): Promise<MonthlyRevenue[]> {
  const supabase = createAdminClient();

  let q = supabase
    .from("orders")
    .select("total_amount, placed_at")
    .eq("payment_status", "paid");
  q = dateFilter(q, start, end);
  q = storeFilter(q, storeId);
  const { data } = await q;

  const map = new Map<string, { total: number; count: number }>();
  for (const o of data ?? []) {
    const d = new Date(o.placed_at);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const entry = map.get(key) ?? { total: 0, count: 0 };
    entry.total += Number(o.total_amount);
    entry.count += 1;
    map.set(key, entry);
  }

  return Array.from(map.entries())
    .map(([k, v]) => ({
      month: k,
      year: parseInt(k.split("-")[0]),
      total_revenue: v.total,
      orders_count: v.count,
    }))
    .sort((a, b) => a.month.localeCompare(b.month));
}

export type GSTSummary = {
  totalGst: number;
  totalTaxableAmount: number;
  totalRevenue: number;
  invoicesCount: number;
};

export async function getGSTSummary(
  start?: string | null,
  end?: string | null,
  storeId?: string | null,
): Promise<GSTSummary> {
  const supabase = createAdminClient();

  let iq = supabase
    .from("invoices")
    .select("taxable_amount, cgst, sgst, total_amount, orders!inner(store_id)");
  iq = dateFilter(iq, start, end, "invoice_date");
  iq = storeFilter(iq, storeId);
  const { data: invoices } = await iq;

  const invoicesCount = invoices?.length ?? 0;
  const totalTaxableAmount = (invoices ?? []).reduce((s, i) => s + Number(i.taxable_amount), 0);
  const totalGst = (invoices ?? []).reduce(
    (s, i) => s + Number(i.cgst ?? 0) + Number(i.sgst ?? 0),
    0,
  );
  const totalRevenue = (invoices ?? []).reduce((s, i) => s + Number(i.total_amount), 0);

  return { totalGst, totalTaxableAmount, totalRevenue, invoicesCount };
}

export type GSTMonthly = {
  month: string;
  taxable_amount: number;
  cgst: number;
  sgst: number;
  total_gst: number;
};

export async function getGSTMonthly(
  start?: string | null,
  end?: string | null,
  storeId?: string | null,
): Promise<GSTMonthly[]> {
  const supabase = createAdminClient();

  let q = supabase
    .from("invoices")
    .select("taxable_amount, cgst, sgst, invoice_date, orders!inner(store_id)");
  q = dateFilter(q, start, end, "invoice_date");
  q = storeFilter(q, storeId);
  const { data } = await q;

  const map = new Map<string, { taxable: number; cgst: number; sgst: number }>();
  for (const i of data ?? []) {
    const d = new Date(i.invoice_date);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const entry = map.get(key) ?? { taxable: 0, cgst: 0, sgst: 0 };
    entry.taxable += Number(i.taxable_amount);
    entry.cgst += Number(i.cgst ?? 0);
    entry.sgst += Number(i.sgst ?? 0);
    map.set(key, entry);
  }

  return Array.from(map.entries())
    .map(([k, v]) => ({
      month: k,
      taxable_amount: v.taxable,
      cgst: v.cgst,
      sgst: v.sgst,
      total_gst: v.cgst + v.sgst,
    }))
    .sort((a, b) => a.month.localeCompare(b.month));
}

export type GSTByHSN = {
  hsn_code: string;
  gst_rate: number;
  product_count: number;
  taxable_value: number;
  gst_amount: number;
};

export async function getGSTByHSN(
  start?: string | null,
  end?: string | null,
  storeId?: string | null,
): Promise<GSTByHSN[]> {
  const supabase = createAdminClient();

  let q = supabase
    .from("order_items")
    .select(
      "total_price, gst_rate, gst_amount, products!inner(hsn_code, store_id), orders!inner(store_id)",
    );
  q = dateFilter(q, start, end);
  q = storeFilter(q, storeId);
  const { data } = await q;

  const map = new Map<
    string,
    { hsn: string; rate: number; count: number; taxable: number; gst: number }
  >();
  for (const item of data ?? []) {
    const hsn = (item.products as any)?.hsn_code ?? "NA";
    const rate = Number(item.gst_rate);
    const key = `${hsn}_${rate}`;
    const entry = map.get(key) ?? { hsn, rate, count: 0, taxable: 0, gst: 0 };
    entry.count += 1;
    entry.taxable += Number(item.total_price);
    entry.gst += Number(item.gst_amount);
    map.set(key, entry);
  }

  return Array.from(map.entries())
    .map(([_, v]) => ({
      hsn_code: v.hsn,
      gst_rate: v.rate,
      product_count: v.count,
      taxable_value: v.taxable,
      gst_amount: v.gst,
    }))
    .sort((a, b) => b.taxable_value - a.taxable_value);
}

export type GSTByStore = {
  store_name: string;
  taxable_amount: number;
  cgst: number;
  sgst: number;
  total_gst: number;
};

export async function getGSTByStore(
  start?: string | null,
  end?: string | null,
): Promise<GSTByStore[]> {
  const supabase = createAdminClient();

  let q = supabase
    .from("invoices")
    .select("taxable_amount, cgst, sgst, orders!inner(store_id, stores(name))");
  q = dateFilter(q, start, end, "invoice_date");
  const { data } = await q;

  const map = new Map<string, { name: string; taxable: number; cgst: number; sgst: number }>();
  for (const i of data ?? []) {
    const storeId = (i.orders as any)?.store_id ?? "unknown";
    const storeName = (i.orders as any)?.stores?.name ?? "Unknown";
    const entry = map.get(storeId) ?? { name: storeName, taxable: 0, cgst: 0, sgst: 0 };
    entry.taxable += Number(i.taxable_amount);
    entry.cgst += Number(i.cgst ?? 0);
    entry.sgst += Number(i.sgst ?? 0);
    map.set(storeId, entry);
  }

  return Array.from(map.entries())
    .map(([_, v]) => ({
      store_name: v.name,
      taxable_amount: v.taxable,
      cgst: v.cgst,
      sgst: v.sgst,
      total_gst: v.cgst + v.sgst,
    }))
    .sort((a, b) => b.taxable_amount - a.taxable_amount);
}
