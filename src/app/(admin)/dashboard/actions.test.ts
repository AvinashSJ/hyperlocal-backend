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

describe("getDashboardStats (no storeId — all stores)", () => {
  it("returns aggregate stats with all 10 query responses consumed in order", async () => {
    const admin = getAdminClient();

    // Promise.all([productQ, orderQ, profilesCount, revenueQ, lowStockQ,
    //               todayOrderQ, todayRevenueQ, recentQ, statusQ])
    // Then monthly: rpc("get_monthly_order_stats")
    admin.setResponses(
      { count: 50, error: null }, // 1. productQ (count)
      { count: 200, error: null }, // 2. orderQ (count)
      { count: 1000, error: null }, // 3. profiles count
      { data: [{ total_amount: 5000 }, { total_amount: 3000 }], error: null }, // 4. revenueQ
      { data: [{ id: "p-low", name: "Low Stock Item", sku: "LS-1", stock_quantity: 3, low_stock_threshold: 10 }], error: null }, // 5. lowStockQ
      { count: 5, error: null }, // 6. todayOrderQ
      { data: [{ total_amount: 200 }], error: null }, // 7. todayRevenueQ
      {
        data: [
          { id: "o-1", order_number: "ORD-001", status: "delivered", total_amount: 118, payment_status: "paid", placed_at: "2025-01-15T10:00:00Z", profiles: [{ full_name: "Alice" }] },
        ],
        error: null,
      }, // 8. recentQ
      { data: [{ status: "delivered" }, { status: "delivered" }, { status: "pending" }], error: null }, // 9. statusQ
      { data: [{ month: "Jan 2025", total: 5000 }], error: null }, // 10. monthly rpc
    );

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
    admin.setResponses(
      { count: 0, error: null },
      { count: 0, error: null },
      { count: 0, error: null },
      { data: [{ total_amount: 100 }, { total_amount: 250.5 }, { total_amount: 49.5 }], error: null },
      { data: [], error: null },
      { count: 0, error: null },
      { data: [], error: null },
      { data: [], error: null },
      { data: [], error: null },
      { data: [], error: null },
    );

    const stats = await getDashboardStats();
    expect(stats.totalRevenue).toBe(400);
  });

  it("computes todayRevenue as sum of today's paid order amounts", async () => {
    const admin = getAdminClient();
    admin.setResponses(
      { count: 0, error: null },
      { count: 0, error: null },
      { count: 0, error: null },
      { data: [], error: null },
      { data: [], error: null },
      { count: 0, error: null },
      { data: [{ total_amount: 100 }, { total_amount: 200 }], error: null },
      { data: [], error: null },
      { data: [], error: null },
      { data: [], error: null },
    );

    const stats = await getDashboardStats();
    expect(stats.todayRevenue).toBe(300);
  });

  it("aggregates statusBreakdown from status rows (counts per status)", async () => {
    const admin = getAdminClient();
    admin.setResponses(
      { count: 0, error: null },
      { count: 0, error: null },
      { count: 0, error: null },
      { data: [], error: null },
      { data: [], error: null },
      { count: 0, error: null },
      { data: [], error: null },
      { data: [], error: null },
      {
        data: [
          { status: "delivered" },
          { status: "delivered" },
          { status: "delivered" },
          { status: "pending" },
          { status: "cancelled" },
          { status: "cancelled" },
          { status: null },
        ],
        error: null,
      },
      { data: [], error: null },
    );

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
    admin.setResponses(
      { count: 0, error: null },
      { count: 0, error: null },
      { count: 0, error: null },
      { data: [], error: null },
      { data: [], error: null },
      { count: 0, error: null },
      { data: [], error: null },
      { data: [], error: null },
      { data: [], error: null },
      { data: [], error: null },
    );
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
      { count: null, error: null },
      { data: null, error: null },
      { data: null, error: null },
      { count: null, error: null },
      { data: null, error: null },
      { data: null, error: null },
      { data: null, error: null },
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
    admin.setResponses(
      { count: 0, error: null },
      { count: 0, error: null },
      { count: 0, error: null },
      { data: [], error: null },
      { data: [], error: null },
      { count: 0, error: null },
      { data: [], error: null },
      { data: [], error: null },
      { data: [], error: null },
      { data: [], error: null },
    );
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
    admin.setResponses(
      { count: 0, error: null },
      { count: 0, error: null },
      { count: 0, error: null },
      { data: [], error: null },
      { data: [], error: null },
      { count: 0, error: null },
      { data: [], error: null },
      { data: [], error: null },
      { data: [], error: null },
      { data: [], error: null },
    );
    await getDashboardStats();

    const ordersChains = admin.chainsForTable("orders");
    const recentChain = ordersChains[5]; // 6th chain = recentQ (index 5 in 0-based: productQ, orderQ, revenueQ, lowStockQ... wait)
    // The order is: productQ is products table; orderQ, revenueQ, lowStockQ don't exist for orders... let me count orders chains only.
    // orders chains: orderQ, revenueQ, todayOrderQ, todayRevenueQ, recentQ, statusQ
    // That's 6 chains. recentQ is index 4.
    const rec = recentChain[recentChain.length - 1] && recentChain;
    // Easier: just find the chain with order by placed_at
    const recentChainFound = ordersChains.find((c) => c.some((cc) => cc.method === "limit"));
    expect(recentChainFound).toBeDefined();
    const orderCall = recentChainFound!.find((c) => c.method === "order");
    const limitCall = recentChainFound!.find((c) => c.method === "limit");
    expect(orderCall!.args).toEqual(["placed_at", { ascending: false }]);
    expect(limitCall!.args).toEqual([5]);
  });

  it("filters low stock by stock_quantity < 10 ordered asc with limit 5", async () => {
    const admin = getAdminClient();
    admin.setResponses(
      { count: 0, error: null },
      { count: 0, error: null },
      { count: 0, error: null },
      { data: [], error: null },
      { data: [], error: null },
      { count: 0, error: null },
      { data: [], error: null },
      { data: [], error: null },
      { data: [], error: null },
      { data: [], error: null },
    );
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
    admin.setResponses(
      { count: 0, error: null },
      { count: 0, error: null },
      { count: 0, error: null },
      { data: [], error: null },
      { data: [], error: null },
      { count: 0, error: null },
      { data: [], error: null },
      { data: [], error: null },
      { data: [], error: null },
      { data: [], error: null },
    );
    await getDashboardStats();

    const ordersChains = admin.chainsForTable("orders");
    const statusChain = ordersChains.find((c) => c.some((cc) => cc.method === "not"));
    expect(statusChain).toBeDefined();
    const notCall = statusChain!.find((c) => c.method === "not");
    expect(notCall!.args).toEqual(["status", "is", null]);
  });
});

describe("getDashboardStats (with storeId — single store)", () => {
  it("applies eq store_id 8 times in the call log (1 per chain: 2 products + 6 orders base queries)", async () => {
    // The mock's chainsForTable walks the call list and groups calls between
    // from(table) boundaries. Because the source's if block does
    //   productQ.eq -> orderQ.eq -> ... -> lowStockQ.eq
    // the 8 store_id calls get recorded BETWEEN the last products from() and
    // the next from(profiles), so chainsForTable("products") attributes all 8
    // to the lowStockQ chain. The per-chain attribution is not reliable via
    // chainsForTable for this pattern. Instead, we count the total eq calls
    // and verify the source's intent (1 store_id per chain × 8 chains).
    const admin = getAdminClient();
    admin.setResponses(
      { count: 0, error: null },
      { count: 0, error: null },
      { count: 0, error: null },
      { data: [], error: null },
      { data: [], error: null },
      { count: 0, error: null },
      { data: [], error: null },
      { data: [], error: null },
      { data: [], error: null },
      { data: [], error: null },
    );
    await getDashboardStats("s-1");

    const allEqCalls = admin.calls.filter((c) => c.method === "eq");
    const storeIdCalls = allEqCalls.filter((c) => c.args[0] === "store_id");
    // 1 per chain in the if block (productQ, orderQ, revenueQ, todayOrderQ,
    // todayRevenueQ, recentQ, statusQ, lowStockQ) = 8 calls.
    // Plus 1 from the monthly orders query.
    expect(storeIdCalls).toHaveLength(9);
    storeIdCalls.forEach((c) => {
      expect(c.args[1]).toBe("s-1");
    });
  });

  it("uses inline orders placed_at gte query for monthly data (NOT rpc) when storeId provided", async () => {
    const admin = getAdminClient();
    admin.setResponses(
      { count: 0, error: null },
      { count: 0, error: null },
      { count: 0, error: null },
      { data: [], error: null },
      { data: [], error: null },
      { count: 0, error: null },
      { data: [], error: null },
      { data: [], error: null },
      { data: [], error: null },
      { data: [{ total_amount: 100, placed_at: "2025-01-15T00:00:00Z" }], error: null },
    );
    await getDashboardStats("s-1");

    const rpcCalls = admin.calls.filter((c) => c.method === "rpc");
    expect(rpcCalls).toHaveLength(0);

    // Verify the orders gte chain has eq("store_id", "s-1") and gte("placed_at", ...)
    const ordersChains = admin.chainsForTable("orders");
    const monthlyChain = ordersChains.find((c) => c.some((cc) => cc.method === "gte" && cc.args[0] === "placed_at" && typeof cc.args[1] === "string" && cc.args[1].length > 10));
    expect(monthlyChain).toBeDefined();
    const storeEq = monthlyChain!.find((c) => c.method === "eq" && c.args[0] === "store_id");
    expect(storeEq!.args[1]).toBe("s-1");
  });

  it("monthly aggregation groups by toLocaleString(\"default\", { month: \"short\", year: \"numeric\" })", async () => {
    const admin = getAdminClient();
    admin.setResponses(
      { count: 0, error: null },
      { count: 0, error: null },
      { count: 0, error: null },
      { data: [], error: null },
      { data: [], error: null },
      { count: 0, error: null },
      { data: [], error: null },
      { data: [], error: null },
      { data: [], error: null },
      {
        data: [
          { total_amount: 100, placed_at: "2025-01-15T00:00:00Z" },
          { total_amount: 200, placed_at: "2025-01-20T00:00:00Z" },
          { total_amount: 50, placed_at: "2025-02-05T00:00:00Z" },
        ],
        error: null,
      },
    );

    const stats = await getDashboardStats("s-1");
    // The exact month labels depend on locale; we just check structure
    expect(stats.monthlyData.length).toBeGreaterThan(0);
    const monthKeys = stats.monthlyData.map((m) => m.month);
    expect(new Set(monthKeys).size).toBe(2); // Jan + Feb
    const total = stats.monthlyData.reduce((s, m) => s + m.total, 0);
    expect(total).toBe(350);
  });
});
