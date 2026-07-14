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

import { getDashboardStats } from "./actions";

beforeEach(() => {
  resetSupabaseClients();
  resetPermissionMock();
});

/**
 * Sets up the standard 10-response queue in the CORRECT order.
 *
 * After P24, the response consumption order is:
 *   Promise.all (8 queries):
 *     1. productQ count        (from "products")
 *     2. orderQ count          (from "orders")
 *     3. revenueQ data         (from "orders")
 *     4. lowStockQ data        (from "products")
 *     5. todayOrderQ count     (from "orders")
 *     6. todayRevenueQ data    (from "orders")
 *     7. recentQ data          (from "orders")
 *     8. statusQ data          (from "orders")
 *   Then sequentially:
 *     9. customerCount query   (from "orders" for store-scoped, "profiles" for super admin)
 *    10. monthly data query    (RPC for no-storeId, orders gte for storeId)
 *
 * The previous bug: customerCount was the 3rd query in the inline Promise.all,
 * bypassing the if (storeId) filter. Now it's a separate sequential query
 * with the correct store-scoped semantics.
 */
function setStandardResponses(
  admin: ReturnType<typeof getAdminClient>,
  overrides: {
    productCount?: number | null;
    orderCount?: number | null;
    revenueData?: unknown[] | null;
    lowStock?: unknown[] | null;
    todayOrders?: number | null;
    todayRevenueData?: unknown[] | null;
    recentOrders?: unknown[] | null;
    statusData?: unknown[] | null;
    customerCount?: { data?: unknown[] | null; count?: number | null } | null;
    monthly?: { data?: unknown[] | null } | { useRpc?: boolean; data?: unknown[] | null };
  } = {},
) {
  admin.setResponses(
    { count: overrides.productCount ?? 0, error: null },
    { count: overrides.orderCount ?? 0, error: null },
    { data: overrides.revenueData ?? [], error: null },
    { data: overrides.lowStock ?? [], error: null },
    { count: overrides.todayOrders ?? 0, error: null },
    { data: overrides.todayRevenueData ?? [], error: null },
    { data: overrides.recentOrders ?? [], error: null },
    { data: overrides.statusData ?? [], error: null },
    // customerCount: 9th response. For no-storeId, the source reads `count`
    // from a head:true count query → wrap in { count: N }. For storeId,
    // the source reads `data` (an array of { user_id }) → wrap in { data: [...] }.
    overrides.customerCount ?? { data: [], error: null },
    // monthly: 10th response.
    overrides.monthly ?? { data: [], error: null },
  );
}

describe("getDashboardStats (no storeId — all stores)", () => {
  it("returns aggregate stats with all 10 query responses consumed in order", async () => {
    const admin = getAdminClient();
    setStandardResponses(admin, {
      productCount: 50,
      orderCount: 200,
      customerCount: { count: 1000 },
      revenueData: [{ total_amount: 5000 }, { total_amount: 3000 }],
      lowStock: [{ id: "p-low", name: "Low Stock Item", sku: "LS-1", stock_quantity: 3, low_stock_threshold: 10 }],
      todayOrders: 5,
      todayRevenueData: [{ total_amount: 200 }],
      recentOrders: [
        { id: "o-1", order_number: "ORD-001", status: "delivered", total_amount: 118, payment_status: "paid", placed_at: "2025-01-15T10:00:00Z", profiles: { full_name: "Alice" } },
      ],
      statusData: [{ status: "delivered" }, { status: "delivered" }, { status: "pending" }],
      monthly: { useRpc: true, data: [{ month: "Jan 2025", total: 5000 }] },
    });

    const stats = await getDashboardStats();

    expect(stats.productCount).toBe(50);
    expect(stats.orderCount).toBe(200);
    expect(stats.customerCount).toBe(1000);
    expect(stats.totalRevenue).toBe(8000);
    expect(stats.todayOrders).toBe(5);
    expect(stats.todayRevenue).toBe(200);
    expect(stats.lowStock).toHaveLength(1);
    expect(stats.recentOrders).toHaveLength(1);
    expect(stats.statusBreakdown).toEqual({ delivered: 2, pending: 1 });
    expect(stats.monthlyData).toEqual([{ month: "Jan 2025", total: 5000 }]);
  });

  it("computes totalRevenue as sum of all paid order amounts", async () => {
    const admin = getAdminClient();
    setStandardResponses(admin, {
      revenueData: [{ total_amount: 100 }, { total_amount: 250.5 }, { total_amount: 49.5 }],
    });

    const stats = await getDashboardStats();
    expect(stats.totalRevenue).toBe(400);
  });

  it("computes todayRevenue as sum of today's paid order amounts", async () => {
    const admin = getAdminClient();
    setStandardResponses(admin, {
      todayRevenueData: [{ total_amount: 100 }, { total_amount: 200 }],
    });

    const stats = await getDashboardStats();
    expect(stats.todayRevenue).toBe(300);
  });

  it("aggregates statusBreakdown from status rows (counts per status)", async () => {
    const admin = getAdminClient();
    setStandardResponses(admin, {
      statusData: [
        { status: "delivered" },
        { status: "delivered" },
        { status: "delivered" },
        { status: "pending" },
        { status: "cancelled" },
        { status: "cancelled" },
        { status: null },
      ],
    });

    const stats = await getDashboardStats();
    expect(stats.statusBreakdown).toEqual({
      delivered: 3,
      pending: 1,
      cancelled: 2,
      unknown: 1,
    });
  });

  it("uses rpc('get_monthly_order_stats') for monthly data when no storeId", async () => {
    const admin = getAdminClient();
    setStandardResponses(admin, {
      monthly: { useRpc: true, data: [] },
    });
    await getDashboardStats();

    const rpcCalls = admin.calls.filter((c) => c.method === "rpc");
    expect(rpcCalls).toHaveLength(1);
    expect(rpcCalls[0].args[0]).toBe("get_monthly_order_stats");
  });

  it("defaults all counts to 0 when data is null", async () => {
    const admin = getAdminClient();
    admin.setResponses(
      { count: null, error: null },
      { count: null, error: null },
      { data: null, error: null },
      { data: null, error: null },
      { count: null, error: null },
      { data: null, error: null },
      { data: null, error: null },
      { data: null, error: null },
      { count: null, error: null }, // customerCount
      { data: null, error: null },
    );
    const stats = await getDashboardStats();
    expect(stats.productCount).toBe(0);
    expect(stats.orderCount).toBe(0);
    expect(stats.customerCount).toBe(0);
    expect(stats.todayOrders).toBe(0);
    expect(stats.totalRevenue).toBe(0);
    expect(stats.todayRevenue).toBe(0);
  });

  it("filters products by status='active'", async () => {
    const admin = getAdminClient();
    setStandardResponses(admin);
    await getDashboardStats();

    const productChains = admin.chainsForTable("products");
    const productChain = productChains[0];
    const statusEq = productChain.find((c) => c.method === "eq" && c.args[0] === "status");
    expect(statusEq).toBeDefined();
    expect(statusEq!.args[1]).toBe("active");
    const headCall = productChain.find((c) => c.method === "select");
    expect(headCall!.args[1]).toEqual({ count: "exact", head: true });
  });

  it("uses order by placed_at desc and limit 5 for recent orders", async () => {
    const admin = getAdminClient();
    setStandardResponses(admin);
    await getDashboardStats();

    const ordersChains = admin.chainsForTable("orders");
    const recentChainFound = ordersChains.find((c) => c.some((cc) => cc.method === "limit"));
    expect(recentChainFound).toBeDefined();
    const orderCall = recentChainFound!.find((c) => c.method === "order");
    const limitCall = recentChainFound!.find((c) => c.method === "limit");
    expect(orderCall!.args).toEqual(["placed_at", { ascending: false }]);
    expect(limitCall!.args).toEqual([5]);
  });

  it("filters low stock by stock_quantity < 10 ordered asc with limit 5", async () => {
    const admin = getAdminClient();
    setStandardResponses(admin);
    await getDashboardStats();

    const productChains = admin.chainsForTable("products");
    const lowStockChain = productChains.find((c) => c.some((cc) => cc.method === "lt"));
    expect(lowStockChain).toBeDefined();
    const ltCall = lowStockChain!.find((c) => c.method === "lt");
    expect(ltCall!.args).toEqual(["stock_quantity", 10]);
    const orderCall = lowStockChain!.find((c) => c.method === "order");
    expect(orderCall!.args).toEqual(["stock_quantity", { ascending: true }]);
    const limitCall = lowStockChain!.find((c) => c.method === "limit");
    expect(limitCall!.args).toEqual([5]);
  });

  it("filters status breakdown with .not(\"status\", \"is\", null)", async () => {
    const admin = getAdminClient();
    setStandardResponses(admin);
    await getDashboardStats();

    const ordersChains = admin.chainsForTable("orders");
    const statusChain = ordersChains.find((c) => c.some((cc) => cc.method === "not"));
    expect(statusChain).toBeDefined();
    const notCall = statusChain!.find((c) => c.method === "not");
    expect(notCall!.args).toEqual(["status", "is", null]);
  });
});

describe("getDashboardStats (with storeId — single store)", () => {
  it("applies eq store_id 10 times in the call log (P24: +1 for store-scoped customer count from orders)", async () => {
    // After P24, the customer count query for store-scoped users goes through
    // `from("orders")` instead of `from("profiles")`, so the store_id filter
    // is now applied to that query too. Total: 8 (if-block) + 1 (monthly) + 1
    // (customerCount) = 10.
    const admin = getAdminClient();
    setStandardResponses(admin, {
      customerCount: { data: [] }, // empty, store-scoped path
      monthly: { data: [] },
    });
    await getDashboardStats("s-1");

    const allEqCalls = admin.calls.filter((c) => c.method === "eq");
    const storeIdCalls = allEqCalls.filter((c) => c.args[0] === "store_id");
    // 1 per chain in the if block (productQ, orderQ, revenueQ, todayOrderQ,
    // todayRevenueQ, recentQ, statusQ, lowStockQ) = 8 calls.
    // Plus 1 from the monthly orders query.
    // Plus 1 from the P24 customer-count orders query.
    expect(storeIdCalls).toHaveLength(10);
    storeIdCalls.forEach((c) => {
      expect(c.args[1]).toBe("s-1");
    });
  });

  it("uses inline orders placed_at gte query for monthly data (NOT rpc) when storeId provided", async () => {
    const admin = getAdminClient();
    setStandardResponses(admin, {
      customerCount: { data: [] },
      monthly: { data: [{ total_amount: 100, placed_at: "2025-01-15T00:00:00Z" }] },
    });
    await getDashboardStats("s-1");

    const rpcCalls = admin.calls.filter((c) => c.method === "rpc");
    expect(rpcCalls).toHaveLength(0);

    const ordersChains = admin.chainsForTable("orders");
    const monthlyChain = ordersChains.find((c) => c.some((cc) => cc.method === "gte" && cc.args[0] === "placed_at" && typeof cc.args[1] === "string" && cc.args[1].length > 10));
    expect(monthlyChain).toBeDefined();
    const storeEq = monthlyChain!.find((c) => c.method === "eq" && c.args[0] === "store_id");
    expect(storeEq!.args[1]).toBe("s-1");
  });

  it("monthly aggregation groups by toLocaleString(\"default\", { month: \"short\", year: \"numeric\" })", async () => {
    const admin = getAdminClient();
    setStandardResponses(admin, {
      customerCount: { data: [] },
      monthly: { data: [
        { total_amount: 100, placed_at: "2025-01-15T00:00:00Z" },
        { total_amount: 200, placed_at: "2025-01-20T00:00:00Z" },
        { total_amount: 50, placed_at: "2025-02-05T00:00:00Z" },
      ] },
    });

    const stats = await getDashboardStats("s-1");
    expect(stats.monthlyData.length).toBeGreaterThan(0);
    const monthKeys = stats.monthlyData.map((m) => m.month);
    expect(new Set(monthKeys).size).toBe(2); // Jan + Feb
    const total = stats.monthlyData.reduce((s, m) => s + m.total, 0);
    expect(total).toBe(350);
  });
});

describe("P24: customer count data-leak fix", () => {
  it("P24: store-scoped customerCount comes from orders.user_id, NOT profiles (regression for live bug)", async () => {
    const admin = getAdminClient();
    setStandardResponses(admin, {
      // 9th response: orders.user_id for the store's orders
      customerCount: { data: [
        { user_id: "u-1" }, { user_id: "u-2" }, { user_id: "u-1" }, { user_id: "u-3" },
      ] },
      monthly: { data: [] },
    });

    const result = await getDashboardStats("s-1");
    // 4 user_id values, but only 3 distinct → customerCount = 3
    expect(result.customerCount).toBe(3);

    // Verify the source is `from("orders")` (not `from("profiles")`)
    const profilesChains = admin.chainsForTable("profiles");
    expect(profilesChains).toHaveLength(0);
  });

  it("P24: store-scoped customerCount query has eq(\"store_id\", storeId) on it", async () => {
    const admin = getAdminClient();
    setStandardResponses(admin, {
      customerCount: { data: [{ user_id: "u-1" }] },
      monthly: { data: [] },
    });
    await getDashboardStats("s-1");

    // The customer-count orders chain should have a select("user_id") AND
    // an eq("store_id", "s-1"). Find the orders chain that selects only user_id.
    const ordersChains = admin.chainsForTable("orders");
    const customerCountChain = ordersChains.find(
      (chain) => chain.some((c) => c.method === "select" && c.args[0] === "user_id"),
    );
    expect(customerCountChain).toBeDefined();
    const storeEq = customerCountChain!.find((c) => c.method === "eq" && c.args[0] === "store_id");
    expect(storeEq).toBeDefined();
    expect(storeEq!.args[1]).toBe("s-1");
  });

  it("P24: store-scoped customerCount counts DISTINCT user_ids (dedupes across multiple orders)", async () => {
    const admin = getAdminClient();
    setStandardResponses(admin, {
      // 4 orders, only 2 distinct user_ids
      customerCount: { data: [
        { user_id: "u-1" }, { user_id: "u-1" }, { user_id: "u-1" },
        { user_id: "u-2" },
      ] },
      monthly: { data: [] },
    });

    const result = await getDashboardStats("s-1");
    expect(result.customerCount).toBe(2);
  });

  it("P24: store-scoped customerCount is 0 when no orders exist for the store", async () => {
    const admin = getAdminClient();
    setStandardResponses(admin, {
      customerCount: { data: [] },
      monthly: { data: [] },
    });

    const result = await getDashboardStats("s-1");
    expect(result.customerCount).toBe(0);
  });

  it("P24: Super Admin customerCount still comes from profiles (no store filter)", async () => {
    const admin = getAdminClient();
    setStandardResponses(admin, {
      customerCount: { count: 1500 },
      monthly: { useRpc: true, data: [] },
    });

    const result = await getDashboardStats();
    expect(result.customerCount).toBe(1500);

    // Verify the source is `from("profiles")` for Super Admin
    const profilesChains = admin.chainsForTable("profiles");
    expect(profilesChains).toHaveLength(1);
    expect(profilesChains[0].find((c) => c.method === "eq" && c.args[0] === "role")?.args).toEqual(["role", "customer"]);
  });
});
