"use server";

import { createAdminClient } from "@/lib/supabase/admin";

function dateFilter<T extends { gte: (c: string, v: string) => T; lte: (c: string, v: string) => T }>(
  q: T,
  start?: string | null,
  end?: string | null,
  column = "placed_at",
): T {
  if (start) q = q.gte(column, start);
  if (end) q = q.lte(column, `${end}T23:59:59.999Z`);
  return q;
}

function storeFilter<T extends { eq: (c: string, v: unknown) => T }>(
  q: T,
  storeId?: string | null,
): T {
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
    const entry = map.get(id) ?? { name: (o.stores as { name?: string } | null)?.name ?? "Unknown", total: 0, count: 0 };
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
    const hsn = (item.products as { hsn_code?: string } | null)?.hsn_code ?? "NA";
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
    const storeId = (i.orders as { store_id?: string } | null)?.store_id ?? "unknown";
    const storeName = (i.orders as { stores?: { name?: string } | null } | null)?.stores?.name ?? "Unknown";
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

// ============================================================================
// P&L (Profit & Loss) Report
// ============================================================================

export type PnLSummary = {
  grossRevenue: number;
  discounts: number;
  returnsRefunds: number;
  netRevenue: number;
  cogs: number;
  deliveryCharges: number;
  commissions: number;
  grossProfit: number;
  gstCollected: number;
  netProfit: number;
};

export async function getPnLSummary(
  start?: string | null,
  end?: string | null,
  storeId?: string | null,
): Promise<PnLSummary> {
  const supabase = createAdminClient();

  // 1. Revenue from paid orders
  let revQ = supabase
    .from("orders")
    .select("total_amount, discount_amount, delivery_charge, tax_amount")
    .eq("payment_status", "paid");
  revQ = dateFilter(revQ, start, end);
  revQ = storeFilter(revQ, storeId);
  const { data: paidOrders } = await revQ;

  const grossRevenue = (paidOrders ?? []).reduce((s, o) => s + Number(o.total_amount), 0);
  const discounts = (paidOrders ?? []).reduce((s, o) => s + Number(o.discount_amount), 0);
  const deliveryCharges = (paidOrders ?? []).reduce((s, o) => s + Number(o.delivery_charge), 0);
  const gstCollected = (paidOrders ?? []).reduce((s, o) => s + Number(o.tax_amount), 0);

  // 2. Returns/refunds fulfilled in period
  let retQ = supabase
    .from("return_requests")
    .select("resolution_amount, orders!inner(store_id)")
    .in("state", ["fulfilled"])
    .in("resolution", ["full_refund", "partial_refund"]);
  retQ = dateFilter(retQ, start, end, "fulfilled_at");
  retQ = storeFilter(retQ, storeId);
  const { data: returns } = await retQ;
  const returnsRefunds = (returns ?? []).reduce((s, r) => s + Number(r.resolution_amount ?? 0), 0);

  // 3. COGS: order_items.quantity × products.purchase_rate for paid orders
  let cogsQ = supabase
    .from("order_items")
    .select("quantity, product_id, orders!inner(store_id, payment_status, placed_at)");
  cogsQ = cogsQ.eq("orders.payment_status", "paid");
  cogsQ = dateFilter(cogsQ, start, end, "orders.placed_at");
  cogsQ = storeFilter(cogsQ, storeId);
  const { data: orderItems } = await cogsQ;

  // Fetch purchase_rates for all referenced products
  const productIds = [...new Set((orderItems ?? []).map((i) => i.product_id).filter(Boolean))] as string[];
  const purchaseRateMap = new Map<string, number>();
  if (productIds.length > 0) {
    const { data: products } = await supabase
      .from("products")
      .select("id, purchase_rate")
      .in("id", productIds);
    for (const p of products ?? []) {
      if (p.purchase_rate != null) purchaseRateMap.set(p.id, Number(p.purchase_rate));
    }
  }
  const cogs = (orderItems ?? []).reduce(
    (s, i) => s + Number(i.quantity) * (purchaseRateMap.get(i.product_id as string) ?? 0),
    0,
  );

  // 4. Commissions for period
  let commQ = supabase
    .from("store_commissions")
    .select("commission_amount, store_id");
  if (start) commQ = commQ.gte("period_start", start);
  if (end) commQ = commQ.lte("period_end", end);
  commQ = storeFilter(commQ, storeId);
  const { data: commissions } = await commQ;
  const totalCommissions = (commissions ?? []).reduce((s, c) => s + Number(c.commission_amount), 0);

  const netRevenue = grossRevenue - discounts - returnsRefunds;
  const grossProfit = netRevenue - cogs - deliveryCharges - totalCommissions;
  const netProfit = grossProfit - gstCollected;

  return {
    grossRevenue,
    discounts,
    returnsRefunds,
    netRevenue,
    cogs,
    deliveryCharges,
    commissions: totalCommissions,
    grossProfit,
    gstCollected,
    netProfit,
  };
}

// ============================================================================
// Product Wise Sales Report
// ============================================================================

export type ProductSaleRow = {
  product_name: string;
  variant_name: string | null;
  hsn_code: string | null;
  units_sold: number;
  total_revenue: number;
  avg_unit_price: number;
  gst_collected: number;
};

export async function getProductSales(
  start?: string | null,
  end?: string | null,
  storeId?: string | null,
): Promise<ProductSaleRow[]> {
  const supabase = createAdminClient();

  let q = supabase
    .from("order_items")
    .select(
      "quantity, unit_price, total_price, gst_amount, product_name, variant_name, product_hsn_code, orders!inner(store_id, payment_status, placed_at)",
    )
    .eq("orders.payment_status", "paid");
  q = dateFilter(q, start, end, "orders.placed_at");
  q = storeFilter(q, storeId);
  const { data } = await q;

  const map = new Map<
    string,
    { product: string; variant: string | null; hsn: string | null; units: number; revenue: number; gst: number }
  >();

  for (const item of data ?? []) {
    const key = `${item.product_name ?? "Unknown"}_${item.variant_name ?? ""}`;
    const entry = map.get(key) ?? {
      product: item.product_name ?? "Unknown",
      variant: item.variant_name as string | null,
      hsn: item.product_hsn_code as string | null,
      units: 0,
      revenue: 0,
      gst: 0,
    };
    entry.units += Number(item.quantity);
    entry.revenue += Number(item.total_price);
    entry.gst += Number(item.gst_amount);
    map.set(key, entry);
  }

  return Array.from(map.values())
    .map((v) => ({
      product_name: v.product,
      variant_name: v.variant,
      hsn_code: v.hsn,
      units_sold: v.units,
      total_revenue: v.revenue,
      avg_unit_price: v.units > 0 ? v.revenue / v.units : 0,
      gst_collected: v.gst,
    }))
    .sort((a, b) => b.total_revenue - a.total_revenue);
}

// ============================================================================
// GST Filing Report (CGST + SGST breakdown by HSN)
// ============================================================================

export type GSTFilingRow = {
  hsn_code: string;
  gst_rate: number;
  items_count: number;
  taxable_value: number;
  cgst: number;
  sgst: number;
  igst: number;
  total_gst: number;
};

export type GSTFilingSummary = {
  totalTaxable: number;
  totalCGST: number;
  totalSGST: number;
  totalIGST: number;
  totalGST: number;
};

export async function getGSTFiling(
  start?: string | null,
  end?: string | null,
  storeId?: string | null,
): Promise<{ rows: GSTFilingRow[]; summary: GSTFilingSummary }> {
  const supabase = createAdminClient();

  let q = supabase
    .from("order_items")
    .select(
      "total_price, gst_rate, gst_amount, product_hsn_code, orders!inner(store_id, placed_at)",
    );
  q = dateFilter(q, start, end, "orders.placed_at");
  q = storeFilter(q, storeId);
  const { data } = await q;

  const map = new Map<
    string,
    { hsn: string; rate: number; count: number; taxable: number; gst: number }
  >();

  for (const item of data ?? []) {
    const hsn = (item.product_hsn_code as string) || "NA";
    const rate = Number(item.gst_rate);
    const key = `${hsn}_${rate}`;
    const entry = map.get(key) ?? { hsn, rate, count: 0, taxable: 0, gst: 0 };
    entry.count += 1;
    entry.taxable += Number(item.total_price) - Number(item.gst_amount);
    entry.gst += Number(item.gst_amount);
    map.set(key, entry);
  }

  const rows = Array.from(map.values())
    .map((v) => {
      const halfGst = v.gst / 2;
      return {
        hsn_code: v.hsn,
        gst_rate: v.rate,
        items_count: v.count,
        taxable_value: v.taxable,
        cgst: halfGst,
        sgst: halfGst,
        igst: 0,
        total_gst: v.gst,
      };
    })
    .sort((a, b) => b.taxable_value - a.taxable_value);

  const summary: GSTFilingSummary = {
    totalTaxable: rows.reduce((s, r) => s + r.taxable_value, 0),
    totalCGST: rows.reduce((s, r) => s + r.cgst, 0),
    totalSGST: rows.reduce((s, r) => s + r.sgst, 0),
    totalIGST: rows.reduce((s, r) => s + r.igst, 0),
    totalGST: rows.reduce((s, r) => s + r.total_gst, 0),
  };

  return { rows, summary };
}
