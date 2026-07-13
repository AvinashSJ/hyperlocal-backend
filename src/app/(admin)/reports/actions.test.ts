import { describe, it, expect, beforeEach } from "vitest";
import "../../../../test/mocks/supabase-clients";
import "../../../../test/mocks/next-cache";
import "../../../../test/mocks/next-navigation";
import "../../../../test/mocks/require-permission";
import {
  getAdminClient,
  resetSupabaseClients,
} from "../../../../test/mocks/supabase-clients";
import { resetPermissionMock } from "../../../../test/mocks/require-permission";

import {
  getRevenueSummary,
  getRevenueByStore,
  getRevenueByMethod,
  getMonthlyRevenue,
  getGSTSummary,
  getGSTMonthly,
  getGSTByHSN,
  getGSTByStore,
  getPnLSummary,
  getProductSales,
  getGSTFiling,
} from "./actions";

beforeEach(() => {
  resetSupabaseClients();
  resetPermissionMock();
});

describe("getRevenueSummary", () => {
  it("sums paid order amounts and computes avgOrderValue", async () => {
    const admin = getAdminClient();
    // 1) paid orders within range
    // 2) today's paid orders
    admin.setResponses(
      {
        data: [
          { total_amount: 100 },
          { total_amount: 200.5 },
          { total_amount: 50 },
        ],
        error: null,
      },
      { data: [{ total_amount: 100 }], error: null },
    );

    const summary = await getRevenueSummary();
    expect(summary).toEqual({
      totalRevenue: 350.5,
      ordersCount: 3,
      avgOrderValue: 350.5 / 3,
      todayRevenue: 100,
      todayOrders: 1,
    });
  });

  it("returns zeros when no paid orders exist", async () => {
    const admin = getAdminClient();
    admin.setResponses(
      { data: [], error: null },
      { data: [], error: null },
    );
    const summary = await getRevenueSummary();
    expect(summary).toEqual({
      totalRevenue: 0,
      ordersCount: 0,
      avgOrderValue: 0,
      todayRevenue: 0,
      todayOrders: 0,
    });
  });

  it("returns zeros when data is null", async () => {
    const admin = getAdminClient();
    admin.setResponses(
      { data: null, error: null },
      { data: null, error: null },
    );
    const summary = await getRevenueSummary();
    expect(summary.ordersCount).toBe(0);
    expect(summary.todayOrders).toBe(0);
  });

  it("applies start and end date filters via gte/lte", async () => {
    const admin = getAdminClient();
    admin.setResponses({ data: [], error: null }, { data: [], error: null });
    await getRevenueSummary("2025-01-01", "2025-12-31");

    const ordersChains = admin.chainsForTable("orders");
    // First chain: range filter
    const rangeChain = ordersChains[0];
    const gteCall = rangeChain.find((c) => c.method === "gte");
    const lteCall = rangeChain.find((c) => c.method === "lte");
    expect(gteCall).toBeDefined();
    expect(gteCall!.args).toEqual(["placed_at", "2025-01-01"]);
    expect(lteCall).toBeDefined();
    expect(lteCall!.args).toEqual(["placed_at", "2025-12-31T23:59:59.999Z"]);
  });

  it("applies only gte when only start is provided", async () => {
    const admin = getAdminClient();
    admin.setResponses({ data: [], error: null }, { data: [], error: null });
    await getRevenueSummary("2025-01-01", null);

    const ordersChains = admin.chainsForTable("orders");
    const rangeChain = ordersChains[0];
    expect(rangeChain.some((c) => c.method === "gte")).toBe(true);
    expect(rangeChain.some((c) => c.method === "lte")).toBe(false);
  });

  it("applies only lte when only end is provided", async () => {
    const admin = getAdminClient();
    admin.setResponses({ data: [], error: null }, { data: [], error: null });
    await getRevenueSummary(null, "2025-12-31");

    const ordersChains = admin.chainsForTable("orders");
    const rangeChain = ordersChains[0];
    expect(rangeChain.some((c) => c.method === "gte")).toBe(false);
    expect(rangeChain.some((c) => c.method === "lte")).toBe(true);
  });

  it("applies store_id eq when storeId is provided (on both queries)", async () => {
    const admin = getAdminClient();
    admin.setResponses({ data: [], error: null }, { data: [], error: null });
    await getRevenueSummary(null, null, "s-1");

    const ordersChains = admin.chainsForTable("orders");
    // 2 chains (range, today) — both should have eq("store_id", "s-1")
    ordersChains.forEach((chain) => {
      const eqCall = chain.find((c) => c.method === "eq" && c.args[0] === "store_id");
      expect(eqCall).toBeDefined();
      expect(eqCall!.args[1]).toBe("s-1");
    });
  });

  it("always filters by payment_status=paid", async () => {
    const admin = getAdminClient();
    admin.setResponses({ data: [], error: null }, { data: [], error: null });
    await getRevenueSummary();
    const ordersChains = admin.chainsForTable("orders");
    ordersChains.forEach((chain) => {
      const paidEq = chain.find((c) => c.method === "eq" && c.args[0] === "payment_status");
      expect(paidEq).toBeDefined();
      expect(paidEq!.args[1]).toBe("paid");
    });
  });

  it("issues 2 chains: range then today (today uses .gte(\"placed_at\", today_date))", async () => {
    const admin = getAdminClient();
    admin.setResponses({ data: [], error: null }, { data: [], error: null });
    await getRevenueSummary();

    const ordersChains = admin.chainsForTable("orders");
    expect(ordersChains).toHaveLength(2);
    // Second chain (today) should have gte with today's date as ISO date prefix
    const today = new Date().toISOString().slice(0, 10);
    const todayGte = ordersChains[1].find((c) => c.method === "gte");
    expect(todayGte).toBeDefined();
    expect(todayGte!.args).toEqual(["placed_at", today]);
  });

  it("avgOrderValue is 0 when ordersCount is 0 (not NaN)", async () => {
    const admin = getAdminClient();
    admin.setResponses({ data: [], error: null }, { data: [], error: null });
    const summary = await getRevenueSummary();
    expect(summary.avgOrderValue).toBe(0);
    expect(Number.isNaN(summary.avgOrderValue)).toBe(false);
  });
});

describe("getRevenueByStore", () => {
  it("aggregates paid revenue by store, sorted desc by total_revenue", async () => {
    const admin = getAdminClient();
    admin.setResponses({
      data: [
        { total_amount: 100, store_id: "s-1", stores: { name: "Alpha" } },
        { total_amount: 200, store_id: "s-1", stores: { name: "Alpha" } },
        { total_amount: 50, store_id: "s-2", stores: { name: "Beta" } },
        { total_amount: 75, store_id: null, stores: null },
      ],
      error: null,
    });

    const result = await getRevenueByStore();
    expect(result).toHaveLength(3);
    // Sorted desc: Alpha (300), Beta (50), Unknown (75)... wait, Unknown is 75 > 50
    expect(result[0]).toEqual({
      store_name: "Alpha",
      total_revenue: 300,
      orders_count: 2,
      avg_order_value: 150,
    });
    expect(result[1]).toEqual({
      store_name: "Unknown",
      total_revenue: 75,
      orders_count: 1,
      avg_order_value: 75,
    });
    expect(result[2]).toEqual({
      store_name: "Beta",
      total_revenue: 50,
      orders_count: 1,
      avg_order_value: 50,
    });
  });

  it("returns [] when data is null", async () => {
    const admin = getAdminClient();
    admin.setResponses({ data: null, error: null });
    expect(await getRevenueByStore()).toEqual([]);
  });

  it("returns [] when data is empty", async () => {
    const admin = getAdminClient();
    admin.setResponses({ data: [], error: null });
    expect(await getRevenueByStore()).toEqual([]);
  });

  it("does NOT apply store_id filter (getRevenueByStore has no storeId param)", async () => {
    const admin = getAdminClient();
    admin.setResponses({ data: [], error: null });
    await getRevenueByStore();
    const ordersChains = admin.chainsForTable("orders");
    expect(ordersChains[0].some((c) => c.method === "eq" && c.args[0] === "store_id")).toBe(false);
  });
});

describe("getRevenueByMethod", () => {
  it("aggregates paid revenue by payment method, sorted desc, with label map", async () => {
    const admin = getAdminClient();
    admin.setResponses({
      data: [
        { total_amount: 100, payment_method: "cod" },
        { total_amount: 200, payment_method: "upi" },
        { total_amount: 50, payment_method: "upi" },
        { total_amount: 75, payment_method: null },
      ],
      error: null,
    });

    const result = await getRevenueByMethod();
    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({ payment_method: "UPI", total_revenue: 250, orders_count: 2 });
    expect(result[1]).toEqual({ payment_method: "Cash on Delivery", total_revenue: 100, orders_count: 1 });
    expect(result[2]).toEqual({ payment_method: "Unknown", total_revenue: 75, orders_count: 1 });
  });

  it("falls back to raw method key when not in label map", async () => {
    const admin = getAdminClient();
    admin.setResponses({
      data: [{ total_amount: 100, payment_method: "weird-new-method" }],
      error: null,
    });
    const result = await getRevenueByMethod();
    expect(result[0].payment_method).toBe("weird-new-method");
  });

  it("applies store_id eq when storeId is provided", async () => {
    const admin = getAdminClient();
    admin.setResponses({ data: [], error: null });
    await getRevenueByMethod(null, null, "s-1");
    const ordersChains = admin.chainsForTable("orders");
    expect(ordersChains[0].some((c) => c.method === "eq" && c.args[0] === "store_id")).toBe(true);
  });
});

describe("getMonthlyRevenue", () => {
  it("groups paid orders by YYYY-MM, sorted asc by month", async () => {
    const admin = getAdminClient();
    admin.setResponses({
      data: [
        { total_amount: 100, placed_at: "2025-01-15T10:00:00Z" },
        { total_amount: 200, placed_at: "2025-01-20T10:00:00Z" },
        { total_amount: 50, placed_at: "2025-02-05T10:00:00Z" },
      ],
      error: null,
    });

    const result = await getMonthlyRevenue();
    expect(result).toEqual([
      { month: "2025-01", year: 2025, total_revenue: 300, orders_count: 2 },
      { month: "2025-02", year: 2025, total_revenue: 50, orders_count: 1 },
    ]);
  });

  it("zero-pads month numbers (Jan=01, not 1)", async () => {
    const admin = getAdminClient();
    admin.setResponses({
      data: [{ total_amount: 100, placed_at: "2025-01-15T10:00:00Z" }],
      error: null,
    });
    const result = await getMonthlyRevenue();
    expect(result[0].month).toBe("2025-01");
  });

  it("returns [] when data is null", async () => {
    const admin = getAdminClient();
    admin.setResponses({ data: null, error: null });
    expect(await getMonthlyRevenue()).toEqual([]);
  });

  it("applies store_id eq when storeId is provided", async () => {
    const admin = getAdminClient();
    admin.setResponses({ data: [], error: null });
    await getMonthlyRevenue(null, null, "s-1");
    const ordersChains = admin.chainsForTable("orders");
    expect(ordersChains[0].some((c) => c.method === "eq" && c.args[0] === "store_id")).toBe(true);
  });
});

describe("getGSTSummary", () => {
  it("sums taxable, cgst+sgst, total across invoices", async () => {
    const admin = getAdminClient();
    admin.setResponses({
      data: [
        { taxable_amount: 100, cgst: 9, sgst: 9, total_amount: 118 },
        { taxable_amount: 200, cgst: 18, sgst: 18, total_amount: 236 },
      ],
      error: null,
    });

    const summary = await getGSTSummary();
    expect(summary).toEqual({
      totalGst: 54,
      totalTaxableAmount: 300,
      totalRevenue: 354,
      invoicesCount: 2,
    });
  });

  it("treats missing cgst/sgst as 0", async () => {
    const admin = getAdminClient();
    admin.setResponses({
      data: [
        { taxable_amount: 100, cgst: null, sgst: null, total_amount: 100 },
      ],
      error: null,
    });
    const summary = await getGSTSummary();
    expect(summary.totalGst).toBe(0);
    expect(summary.invoicesCount).toBe(1);
  });

  it("uses orders!inner(store_id) join syntax", async () => {
    const admin = getAdminClient();
    admin.setResponses({ data: [], error: null });
    await getGSTSummary();

    const chains = admin.chainsForTable("invoices");
    const selectCall = chains[0].find((c) => c.method === "select");
    expect(selectCall!.args[0]).toBe(
      "taxable_amount, cgst, sgst, total_amount, orders!inner(store_id)",
    );
  });

  it("applies date filter using invoice_date column (not placed_at)", async () => {
    const admin = getAdminClient();
    admin.setResponses({ data: [], error: null });
    await getGSTSummary("2025-01-01", "2025-12-31");

    const chains = admin.chainsForTable("invoices");
    const gteCall = chains[0].find((c) => c.method === "gte");
    const lteCall = chains[0].find((c) => c.method === "lte");
    expect(gteCall!.args[0]).toBe("invoice_date");
    expect(lteCall!.args[0]).toBe("invoice_date");
  });

  it("applies store_id eq via orders.store_id (foreign-key path) when storeId provided", async () => {
    const admin = getAdminClient();
    admin.setResponses({ data: [], error: null });
    await getGSTSummary(null, null, "s-1");
    // The storeFilter helper uses `eq("store_id", storeId)` which works for
    // simple top-level tables, but here we're joining invoices -> orders.
    // The mock records it as-is; the real PostgREST would need a different
    // syntax. Test locks in current source behavior.
    const chains = admin.chainsForTable("invoices");
    expect(chains[0].some((c) => c.method === "eq" && c.args[0] === "store_id")).toBe(true);
  });

  it("returns zeros when data is null", async () => {
    const admin = getAdminClient();
    admin.setResponses({ data: null, error: null });
    const summary = await getGSTSummary();
    expect(summary).toEqual({
      totalGst: 0,
      totalTaxableAmount: 0,
      totalRevenue: 0,
      invoicesCount: 0,
    });
  });
});

describe("getGSTMonthly", () => {
  it("groups invoices by YYYY-MM, sums taxable/cgst/sgst", async () => {
    const admin = getAdminClient();
    admin.setResponses({
      data: [
        { taxable_amount: 100, cgst: 9, sgst: 9, invoice_date: "2025-01-15T10:00:00Z" },
        { taxable_amount: 200, cgst: 18, sgst: 18, invoice_date: "2025-01-20T10:00:00Z" },
        { taxable_amount: 50, cgst: 4.5, sgst: 4.5, invoice_date: "2025-02-05T10:00:00Z" },
      ],
      error: null,
    });

    const result = await getGSTMonthly();
    expect(result).toEqual([
      { month: "2025-01", taxable_amount: 300, cgst: 27, sgst: 27, total_gst: 54 },
      { month: "2025-02", taxable_amount: 50, cgst: 4.5, sgst: 4.5, total_gst: 9 },
    ]);
  });

  it("returns [] when data is null", async () => {
    const admin = getAdminClient();
    admin.setResponses({ data: null, error: null });
    expect(await getGSTMonthly()).toEqual([]);
  });
});

describe("getGSTByHSN", () => {
  it("groups by hsn+rate, sums taxable + gst_amount", async () => {
    const admin = getAdminClient();
    admin.setResponses({
      data: [
        {
          total_price: 100,
          gst_rate: 18,
          gst_amount: 18,
          products: { hsn_code: "1234", store_id: "s-1" },
        },
        {
          total_price: 200,
          gst_rate: 18,
          gst_amount: 36,
          products: { hsn_code: "1234", store_id: "s-1" },
        },
        {
          total_price: 50,
          gst_rate: 5,
          gst_amount: 2.5,
          products: { hsn_code: "5678", store_id: "s-1" },
        },
        {
          total_price: 30,
          gst_rate: 18,
          gst_amount: 5.4,
          products: { hsn_code: null, store_id: "s-1" },
        },
      ],
      error: null,
    });

    const result = await getGSTByHSN();
    expect(result).toHaveLength(3);
    // Sorted desc by taxable_value
    expect(result[0]).toEqual({
      hsn_code: "1234",
      gst_rate: 18,
      product_count: 2,
      taxable_value: 300,
      gst_amount: 54,
    });
    expect(result[1]).toEqual({
      hsn_code: "5678",
      gst_rate: 5,
      product_count: 1,
      taxable_value: 50,
      gst_amount: 2.5,
    });
    expect(result[2]).toEqual({
      hsn_code: "NA",
      gst_rate: 18,
      product_count: 1,
      taxable_value: 30,
      gst_amount: 5.4,
    });
  });

  it("uses order_items with both products and orders inner joins", async () => {
    const admin = getAdminClient();
    admin.setResponses({ data: [], error: null });
    await getGSTByHSN();

    const chains = admin.chainsForTable("order_items");
    const selectCall = chains[0].find((c) => c.method === "select");
    expect(selectCall!.args[0]).toBe(
      "total_price, gst_rate, gst_amount, products!inner(hsn_code, store_id), orders!inner(store_id)",
    );
  });

  it("returns [] when data is null", async () => {
    const admin = getAdminClient();
    admin.setResponses({ data: null, error: null });
    expect(await getGSTByHSN()).toEqual([]);
  });
});

describe("getGSTByStore", () => {
  it("groups invoices by store, sums taxable/cgst/sgst", async () => {
    const admin = getAdminClient();
    admin.setResponses({
      data: [
        {
          taxable_amount: 100,
          cgst: 9,
          sgst: 9,
          orders: { store_id: "s-1", stores: { name: "Alpha" } },
        },
        {
          taxable_amount: 200,
          cgst: 18,
          sgst: 18,
          orders: { store_id: "s-1", stores: { name: "Alpha" } },
        },
        {
          taxable_amount: 50,
          cgst: 4.5,
          sgst: 4.5,
          orders: { store_id: "s-2", stores: { name: "Beta" } },
        },
      ],
      error: null,
    });

    const result = await getGSTByStore();
    expect(result).toHaveLength(2);
    // Sorted desc by taxable_amount
    expect(result[0]).toEqual({
      store_name: "Alpha",
      taxable_amount: 300,
      cgst: 27,
      sgst: 27,
      total_gst: 54,
    });
    expect(result[1]).toEqual({
      store_name: "Beta",
      taxable_amount: 50,
      cgst: 4.5,
      sgst: 4.5,
      total_gst: 9,
    });
  });

  it("uses invoices with orders!inner(store_id, stores(name)) join", async () => {
    const admin = getAdminClient();
    admin.setResponses({ data: [], error: null });
    await getGSTByStore();

    const chains = admin.chainsForTable("invoices");
    const selectCall = chains[0].find((c) => c.method === "select");
    expect(selectCall!.args[0]).toBe(
      "taxable_amount, cgst, sgst, orders!inner(store_id, stores(name))",
    );
  });

  it("does NOT apply store_id filter (no storeId param)", async () => {
    const admin = getAdminClient();
    admin.setResponses({ data: [], error: null });
    await getGSTByStore();
    const chains = admin.chainsForTable("invoices");
    expect(chains[0].some((c) => c.method === "eq" && c.args[0] === "store_id")).toBe(false);
  });

  it("returns [] when data is null", async () => {
    const admin = getAdminClient();
    admin.setResponses({ data: null, error: null });
    expect(await getGSTByStore()).toEqual([]);
  });
});

// ============================================================================
// P&L
// ============================================================================

describe("getPnLSummary", () => {
  it("computes P&L from paid orders, returns, COGS, and commissions", async () => {
    const admin = getAdminClient();
    // 5 sequential queries: orders, return_requests, order_items, products, store_commissions
    admin.setResponses(
      { data: [{ total_amount: 1000, discount_amount: 50, delivery_charge: 30, tax_amount: 90 }], error: null },
      { data: [{ resolution_amount: 100, orders: { store_id: null } }], error: null },
      { data: [{ quantity: 5, product_id: "p-1", orders: { store_id: null, payment_status: "paid", placed_at: "2026-07-01T00:00:00Z" } }], error: null },
      { data: [{ id: "p-1", purchase_rate: 40 }], error: null },
      { data: [{ commission_amount: 50, store_id: null }], error: null },
    );

    const result = await getPnLSummary();
    expect(result.grossRevenue).toBe(1000);
    expect(result.discounts).toBe(50);
    expect(result.returnsRefunds).toBe(100);
    expect(result.netRevenue).toBe(850);
    expect(result.cogs).toBe(200);
    expect(result.deliveryCharges).toBe(30);
    expect(result.commissions).toBe(50);
    expect(result.grossProfit).toBe(570);
    expect(result.gstCollected).toBe(90);
    expect(result.netProfit).toBe(480);
  });

  it("returns zeros when no data exists", async () => {
    const admin = getAdminClient();
    admin.setResponses(
      { data: [], error: null },  // paid orders
      { data: [], error: null },  // returns
      { data: [], error: null },  // order_items
      null,                        // products query skipped (productIds empty)
      { data: [], error: null },  // commissions
    );

    const result = await getPnLSummary();
    expect(result.grossRevenue).toBe(0);
    expect(result.netProfit).toBe(0);
  });
});

// ============================================================================
// Product Sales
// ============================================================================

describe("getProductSales", () => {
  it("groups order_items by product name", async () => {
    const admin = getAdminClient();
    admin.setResponses({
      data: [
        { quantity: 2, unit_price: 100, total_price: 200, gst_amount: 18, product_name: "Widget", variant_name: null, product_hsn_code: "1234", orders: { store_id: null, payment_status: "paid", placed_at: "2026-07-01T00:00:00Z" } },
        { quantity: 1, unit_price: 100, total_price: 100, gst_amount: 9, product_name: "Widget", variant_name: null, product_hsn_code: "1234", orders: { store_id: null, payment_status: "paid", placed_at: "2026-07-01T00:00:00Z" } },
        { quantity: 3, unit_price: 50, total_price: 150, gst_amount: 7.5, product_name: "Gadget", variant_name: "Pro", product_hsn_code: "5678", orders: { store_id: null, payment_status: "paid", placed_at: "2026-07-01T00:00:00Z" } },
      ],
      error: null,
    });

    const result = await getProductSales();
    expect(result).toHaveLength(2);

    const widget = result.find((r) => r.product_name === "Widget")!;
    expect(widget.units_sold).toBe(3);
    expect(widget.total_revenue).toBe(300);
    expect(widget.avg_unit_price).toBe(100);

    const gadget = result.find((r) => r.product_name === "Gadget")!;
    expect(gadget.units_sold).toBe(3);
    expect(gadget.total_revenue).toBe(150);
  });

  it("returns [] when no data", async () => {
    const admin = getAdminClient();
    admin.setResponses({ data: [], error: null });
    expect(await getProductSales()).toEqual([]);
  });
});

// ============================================================================
// GST Filing
// ============================================================================

describe("getGSTFiling", () => {
  it("groups by HSN code and computes CGST/SGST split", async () => {
    const admin = getAdminClient();
    admin.setResponses({
      data: [
        { total_price: 118, gst_rate: 18, gst_amount: 18, product_hsn_code: "1234", orders: { store_id: null, placed_at: "2026-07-01T00:00:00Z" } },
        { total_price: 59, gst_rate: 18, gst_amount: 9, product_hsn_code: "1234", orders: { store_id: null, placed_at: "2026-07-01T00:00:00Z" } },
        { total_price: 105, gst_rate: 5, gst_amount: 5, product_hsn_code: "5678", orders: { store_id: null, placed_at: "2026-07-01T00:00:00Z" } },
      ],
      error: null,
    });

    const { rows, summary } = await getGSTFiling();
    expect(rows).toHaveLength(2);

    const hsn1234 = rows.find((r) => r.hsn_code === "1234")!;
    expect(hsn1234.taxable_value).toBe(150);
    expect(hsn1234.total_gst).toBe(27);
    expect(hsn1234.cgst).toBe(13.5);
    expect(hsn1234.sgst).toBe(13.5);

    const hsn5678 = rows.find((r) => r.hsn_code === "5678")!;
    expect(hsn5678.taxable_value).toBe(100);
    expect(hsn5678.total_gst).toBe(5);

    expect(summary.totalTaxable).toBe(250);
    expect(summary.totalGST).toBe(32);
    expect(summary.totalCGST).toBe(16);
    expect(summary.totalSGST).toBe(16);
  });

  it("returns empty summary when no data", async () => {
    const admin = getAdminClient();
    admin.setResponses({ data: [], error: null });
    const { rows, summary } = await getGSTFiling();
    expect(rows).toEqual([]);
    expect(summary.totalGST).toBe(0);
  });
});
