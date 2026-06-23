import { describe, it, expect, beforeEach, vi } from "vitest";
import "../../../../test/mocks/supabase-clients";
import "../../../../test/mocks/next-cache";
import "../../../../test/mocks/next-navigation";
import "../../../../test/mocks/require-permission";
import {
  getAdminClient,
  resetSupabaseClients,
  setServerUser,
} from "../../../../test/mocks/supabase-clients";
import { revalidatePathMock } from "../../../../test/mocks/next-cache";
import {
  asAdmin,
  asSuperAdmin,
  resetPermissionMock,
  assertPermissionMock,
  PermissionError,
} from "../../../../test/mocks/require-permission";
import { makeStore } from "../../../../test/fixtures/factories";

import {
  getStores,
  getStoreById,
  getStoreRelations,
  deleteStore,
  getStoreCategories,
  getLockedStoreCategories,
  assertCategoriesRemovable,
  setStoreCategories,
  getEligibleManagers,
} from "./actions";

beforeEach(() => {
  resetSupabaseClients();
  resetPermissionMock();
  revalidatePathMock.mockClear();
  assertPermissionMock.mockClear();
});

describe("getStores", () => {
  it("returns the full store list", async () => {
    asSuperAdmin();
    const admin = getAdminClient();
    admin.enqueueResponse({
      data: [makeStore({ id: "s-1" }), makeStore({ id: "s-2" })],
      error: null,
    });

    const result = await getStores();
    expect(result).toHaveLength(2);
  });

  it("returns empty array when data is null", async () => {
    asSuperAdmin();
    const admin = getAdminClient();
    admin.enqueueResponse({ data: null, error: null });

    expect(await getStores()).toEqual([]);
  });

  it("throws on db error", async () => {
    asSuperAdmin();
    const admin = getAdminClient();
    admin.enqueueResponse({ data: null, error: { message: "db boom" } });

    await expect(getStores()).rejects.toThrow("db boom");
  });
});

describe("getStoreById", () => {
  it("returns the matching store", async () => {
    asSuperAdmin();
    const admin = getAdminClient();
    admin.enqueueResponse({
      data: makeStore({ id: "s-42", name: "Downtown" }),
      error: null,
    });

    const result = await getStoreById("s-42");
    expect(result?.id).toBe("s-42");
    expect(result?.name).toBe("Downtown");
  });

  it("returns null when the id is unknown", async () => {
    asSuperAdmin();
    const admin = getAdminClient();
    admin.enqueueResponse({ data: null, error: null });

    expect(await getStoreById("does-not-exist")).toBeNull();
  });

  it("throws on db error", async () => {
    asSuperAdmin();
    const admin = getAdminClient();
    admin.enqueueResponse({ data: null, error: { message: "lookup failed" } });

    await expect(getStoreById("s-1")).rejects.toThrow("lookup failed");
  });
});

describe("getStoreRelations", () => {
  // The function fires 9 sequential take() calls in this exact order.
  // The Promise.all array's order is preserved, BUT `getProducts(id)`
  // is an async function — its synchronous body runs immediately
  // when the array is being built, so its internal `await` fires
  // its take() FIRST. This makes the actual order:
  //   1. products list  (from getProducts()'s internal query — fires
  //                       synchronously when getProducts(id) is called)
  //   2. delivery_zones count
  //   3. gst_numbers count
  //   4. orders count
  //   5. orders list
  //   6. invoices count
  //   7. invoices list
  //   8. products count
  //   9. orders-for-customers
  // Plus 1 follow-up: a profiles fetch for the top user_ids (only
  // fires when the customers query returned > 0 rows).
  // Tests enqueue responses in this order.

  it("returns counts of zones and gst numbers (and zero counts for the new sections when empty)", async () => {
    asSuperAdmin();
    const admin = getAdminClient();
    admin.enqueueResponse({ data: [], error: null });               // 1) products list
    admin.enqueueResponse({ count: 3, data: null, error: null });  // 2) zones
    admin.enqueueResponse({ count: 2, data: null, error: null });  // 3) gst
    admin.enqueueResponse({ count: 0, data: null, error: null });  // 4) order count
    admin.enqueueResponse({ data: [], error: null });               // 5) orders list
    admin.enqueueResponse({ count: 0, data: null, error: null });  // 6) invoice count
    admin.enqueueResponse({ data: [], error: null });               // 7) invoices list
    admin.enqueueResponse({ count: 0, data: null, error: null });  // 8) product count
    admin.enqueueResponse({ data: [], error: null });               // 9) orders-for-customers

    const result = await getStoreRelations("s-1");
    expect(result.zones).toBe(3);
    expect(result.gstNumbers).toBe(2);
    expect(result.orderCount).toBe(0);
    expect(result.invoiceCount).toBe(0);
    expect(result.productCount).toBe(0);
    expect(result.customerCount).toBe(0);
    expect(result.orders).toEqual([]);
    expect(result.customers).toEqual([]);
    expect(result.invoices).toEqual([]);
    expect(result.products).toEqual([]);
  });

  it("defaults to 0 when counts are null", async () => {
    asSuperAdmin();
    const admin = getAdminClient();
    // 1) products list — needs data: [] (not null) so the customers
    //    loop short-circuits cleanly. The .then() chain returns data
    //    and the loop iterates over an empty array.
    for (let i = 0; i < 9; i++) {
      admin.enqueueResponse({ count: null, data: i === 0 ? [] : null, error: null });
    }

    const result = await getStoreRelations("s-1");
    expect(result.zones).toBe(0);
    expect(result.gstNumbers).toBe(0);
    expect(result.orderCount).toBe(0);
    expect(result.invoiceCount).toBe(0);
    expect(result.productCount).toBe(0);
    expect(result.customerCount).toBe(0);
  });

  it("P49: returns recent orders with the correct shape", async () => {
    asSuperAdmin();
    const admin = getAdminClient();
    admin.enqueueResponse({ data: [], error: null });               // 1) products list
    admin.enqueueResponse({ count: 5, data: null, error: null });  // 2) zones
    admin.enqueueResponse({ count: 1, data: null, error: null });  // 3) gst
    admin.enqueueResponse({ count: 5, data: null, error: null });  // 4) order count
    // 5) orders list — the data we actually want to assert on
    admin.enqueueResponse({
      data: [
        {
          id: "o-1",
          order_number: "ORD-001",
          user_id: "u-1",
          total_amount: 1200,
          status: "delivered",
          placed_at: "2026-06-21T00:00:00.000Z",
          profiles: { full_name: "Alice" },
        },
      ],
      error: null,
    });
    admin.enqueueResponse({ count: 0, data: null, error: null });  // 6) invoice count
    admin.enqueueResponse({ data: [], error: null });               // 7) invoices list
    admin.enqueueResponse({ count: 0, data: null, error: null });  // 8) product count
    admin.enqueueResponse({ data: [], error: null });               // 9) orders-for-customers

    const result = await getStoreRelations("s-1");
    expect(result.orders).toHaveLength(1);
    expect(result.orders[0].order_number).toBe("ORD-001");
    expect(result.orders[0].customer_name).toBe("Alice");
    expect(result.orders[0].total_amount).toBe(1200);
  });

  it("P49: computes top customers by order count", async () => {
    asSuperAdmin();
    const admin = getAdminClient();
    admin.enqueueResponse({ data: [], error: null });               // 1) products list
    admin.enqueueResponse({ count: 0, data: null, error: null });  // 2) zones
    admin.enqueueResponse({ count: 0, data: null, error: null });  // 3) gst
    admin.enqueueResponse({ count: 5, data: null, error: null });  // 4) order count
    admin.enqueueResponse({ data: [], error: null });               // 5) orders list
    admin.enqueueResponse({ count: 0, data: null, error: null });  // 6) invoice count
    admin.enqueueResponse({ data: [], error: null });               // 7) invoices list
    admin.enqueueResponse({ count: 0, data: null, error: null });  // 8) product count
    // 9) orders-for-customers: 3 orders for u-1, 2 for u-2, 1 for u-3
    admin.enqueueResponse({
      data: [
        { user_id: "u-1" }, { user_id: "u-1" }, { user_id: "u-1" },
        { user_id: "u-2" }, { user_id: "u-2" },
        { user_id: "u-3" },
      ],
      error: null,
    });
    // 10) profile fetch for the top 3 user_ids (only fires when
    // the customers loop has rows; here it has 3)
    admin.enqueueResponse({
      data: [
        { id: "u-1", full_name: "Alice", email: "a@x.com", phone: "111" },
        { id: "u-2", full_name: "Bob", email: "b@x.com", phone: "222" },
        { id: "u-3", full_name: "Charlie", email: "c@x.com", phone: "333" },
      ],
      error: null,
    });

    const result = await getStoreRelations("s-1");
    expect(result.customerCount).toBe(3);
    expect(result.customers).toHaveLength(3);
    // Top by order count: u-1 (3), u-2 (2), u-3 (1)
    expect(result.customers[0].id).toBe("u-1");
    expect(result.customers[0].order_count).toBe(3);
    expect(result.customers[0].full_name).toBe("Alice");
    expect(result.customers[1].id).toBe("u-2");
    expect(result.customers[1].order_count).toBe(2);
    expect(result.customers[2].id).toBe("u-3");
    expect(result.customers[2].order_count).toBe(1);
  });

  it("P49: returns recent invoices with order_number joined", async () => {
    asSuperAdmin();
    const admin = getAdminClient();
    admin.enqueueResponse({ data: [], error: null });               // 1) products list
    admin.enqueueResponse({ count: 0, data: null, error: null });  // 2) zones
    admin.enqueueResponse({ count: 0, data: null, error: null });  // 3) gst
    admin.enqueueResponse({ count: 0, data: null, error: null });  // 4) order count
    admin.enqueueResponse({ data: [], error: null });               // 5) orders list
    admin.enqueueResponse({ count: 5, data: null, error: null });  // 6) invoice count
    // 7) invoices list — the data we actually want to assert on
    admin.enqueueResponse({
      data: [
        {
          id: "i-1",
          invoice_number: "INV-A1B2C3D4-2026-0001",
          order_id: "o-1",
          total_amount: 1180,
          status: "generated",
          created_at: "2026-06-21T00:00:00.000Z",
          orders: { order_number: "ORD-001" },
        },
      ],
      error: null,
    });
    admin.enqueueResponse({ count: 0, data: null, error: null });  // 8) product count
    admin.enqueueResponse({ data: [], error: null });               // 9) orders-for-customers

    const result = await getStoreRelations("s-1");
    expect(result.invoiceCount).toBe(5);
    expect(result.invoices).toHaveLength(1);
    expect(result.invoices[0].invoice_number).toBe("INV-A1B2C3D4-2026-0001");
    expect(result.invoices[0].order_number).toBe("ORD-001");
  });

  // Regression test for the bug where the invoices list query was
  // returning ALL invoices (regardless of store) on the store detail
  // page. The cause: the embed `orders!invoices_order_id_fkey(...)`
  // only selected `order_number`, but the filter
  // `.eq("orders.store_id", id)` referenced `store_id` — a column
  // NOT in the select. PostgREST drops filters on joined columns
  // that aren't in the select, so the filter was silently ignored.
  //
  // The fix adds `store_id` to the joined embed so the filter is
  // unambiguous. This test pins the contract so a future refactor
  // can't silently reintroduce the bug.
  //
  // Note: the chainable mock treats `.eq()` as a no-op (it just
  // records the call), so this test cannot verify PostgREST's
  // actual filter behavior. It can only verify the chain SHAPE
  // (select string + eq call), which is the layer the bug lived at.
  it("P52: invoices list query embeds store_id in the joined orders select AND applies .eq('orders.store_id', id)", async () => {
    asSuperAdmin();
    const admin = getAdminClient();
    // Queue 9 responses in the same order the function consumes them.
    admin.enqueueResponse({ data: [], error: null });               // 1) products list
    admin.enqueueResponse({ count: 0, data: null, error: null });  // 2) zones
    admin.enqueueResponse({ count: 0, data: null, error: null });  // 3) gst
    admin.enqueueResponse({ count: 0, data: null, error: null });  // 4) order count
    admin.enqueueResponse({ data: [], error: null });               // 5) orders list
    admin.enqueueResponse({ count: 0, data: null, error: null });  // 6) invoice count
    admin.enqueueResponse({ data: [], error: null });               // 7) invoices list
    admin.enqueueResponse({ count: 0, data: null, error: null });  // 8) product count
    admin.enqueueResponse({ data: [], error: null });               // 9) orders-for-customers

    await getStoreRelations("s-store-a");

    // Find the invoices list chain. The function builds two `from("invoices")`
    // chains: the count (6) and the list (7). We want the list chain (the
    // second one).
    const invoiceChains = admin.chainsForTable("invoices");
    expect(invoiceChains.length).toBeGreaterThanOrEqual(2);

    const listChain = invoiceChains[invoiceChains.length - 1];
    const selectCall = listChain.find((c) => c.method === "select");
    const eqCall = listChain.find(
      (c) => c.method === "eq" && c.args[0] === "orders.store_id",
    );

    // 1. The select must include the joined orders embed.
    expect(selectCall).toBeDefined();
    const selectArg = selectCall!.args[0] as string;

    // 2. The embed must include `store_id` so the filter is honored.
    //    Acceptable forms: `orders!invoices_order_id_fkey(store_id, ...)`,
    //    `orders!inner(store_id, ...)`, etc. Just check the string
    //    contains "store_id" inside an orders embed.
    expect(selectArg).toMatch(/orders!?\w*!?\w*\(.*store_id.*\)/);

    // 3. The filter on orders.store_id must be present.
    expect(eqCall).toBeDefined();
    expect(eqCall!.args).toEqual(["orders.store_id", "s-store-a"]);
  });
});

describe("deleteStore", () => {
  it("rejects users without stores:delete permission", async () => {
    asAdmin({ stores: ["view"] });
    await expect(deleteStore("s-1")).rejects.toBeInstanceOf(PermissionError);
  });

  it("throws when the store is not found", async () => {
    asAdmin({ stores: ["delete"] });
    const admin = getAdminClient();
    admin.enqueueResponse({ data: null, error: { message: "not found" } });

    await expect(deleteStore("s-1")).rejects.toThrow("not found");
  });

  it("throws when the store is still active", async () => {
    asAdmin({ stores: ["delete"] });
    const admin = getAdminClient();
    admin.enqueueResponse({
      data: { is_active: true, updated_at: new Date().toISOString(), name: "S1", code: "S1" },
      error: null,
    });

    await expect(deleteStore("s-1")).rejects.toThrow(/Cannot delete an active store/);
  });

  it("throws when the store was disabled less than 90 days ago", async () => {
    asAdmin({ stores: ["delete"] });
    const admin = getAdminClient();
    const recent = new Date();
    recent.setDate(recent.getDate() - 30);
    admin.enqueueResponse({
      data: { is_active: false, updated_at: recent.toISOString(), name: "S1", code: "S1" },
      error: null,
    });

    await expect(deleteStore("s-1")).rejects.toThrow(/at least 90 days/);
  });

  it("cascades deletion of delivery_zones and gst_numbers, then stores", async () => {
    asAdmin({ stores: ["delete"] });
    const admin = getAdminClient();
    const longAgo = new Date();
    longAgo.setDate(longAgo.getDate() - 100);
    admin.enqueueResponse({
      data: { is_active: false, updated_at: longAgo.toISOString(), name: "S1", code: "S1" },
      error: null,
    });
    admin.enqueueResponse({ data: null, error: null }); // delivery_zones
    admin.enqueueResponse({ data: null, error: null }); // gst_numbers
    admin.enqueueResponse({ data: null, error: null }); // stores.delete
    admin.enqueueResponse({ data: null, error: null }); // activity_logs.insert (P50)

    await deleteStore("s-1");

    const tablesTouched = admin.calls
      .filter((c) => c.method === "from")
      .map((c) => c.args[0]);
    expect(tablesTouched).toEqual(["stores", "delivery_zones", "gst_numbers", "stores", "activity_logs"]);
  });

  it("revalidates /stores on success", async () => {
    asAdmin({ stores: ["delete"] });
    const admin = getAdminClient();
    const longAgo = new Date();
    longAgo.setDate(longAgo.getDate() - 100);
    admin.enqueueResponse({
      data: { is_active: false, updated_at: longAgo.toISOString(), name: "S1", code: "S1" },
      error: null,
    });
    admin.enqueueResponse({ data: null, error: null });
    admin.enqueueResponse({ data: null, error: null });
    admin.enqueueResponse({ data: null, error: null });
    admin.enqueueResponse({ data: null, error: null });

    await deleteStore("s-1");
    expect(revalidatePathMock).toHaveBeenCalledWith("/stores");
  });
});

describe("P50: activity logging — audit trail (deleteStore)", () => {
  it("writes a delete log row with the store name + code captured before the cascade", async () => {
    asAdmin({ stores: ["delete"] });
    setServerUser({ id: "u-sa", email: "sa@test.com" });
    const admin = getAdminClient();
    const longAgo = new Date();
    longAgo.setDate(longAgo.getDate() - 100);
    admin.enqueueResponse({
      data: { is_active: false, updated_at: longAgo.toISOString(), name: "OldStore", code: "OS" },
      error: null,
    });
    admin.enqueueResponse({ data: null, error: null });
    admin.enqueueResponse({ data: null, error: null });
    admin.enqueueResponse({ data: null, error: null });
    admin.enqueueResponse({ data: null, error: null });

    await deleteStore("s-old");

    const logChains = admin.chainsForTable("activity_logs");
    expect(logChains).toHaveLength(1);
    const insertArg = logChains[0].find((c) => c.method === "insert")!
      .args[0] as Record<string, unknown>;
    expect(insertArg).toMatchObject({
      user_id: "u-sa",
      action: "delete",
      entity_type: "store",
      entity_id: "s-old",
      details: { name: "OldStore", code: "OS" },
    });
  });

  it("does NOT log when the store is still active (early throw)", async () => {
    asAdmin({ stores: ["delete"] });
    const admin = getAdminClient();
    admin.enqueueResponse({
      data: { is_active: true, updated_at: new Date().toISOString(), name: "S1", code: "S1" },
      error: null,
    });

    await expect(deleteStore("s-1")).rejects.toThrow(/Cannot delete an active store/);
    expect(admin.chainsForTable("activity_logs")).toHaveLength(0);
  });

  it("does NOT log when the store.delete fails", async () => {
    asAdmin({ stores: ["delete"] });
    const admin = getAdminClient();
    const longAgo = new Date();
    longAgo.setDate(longAgo.getDate() - 100);
    admin.enqueueResponse({
      data: { is_active: false, updated_at: longAgo.toISOString(), name: "S1", code: "S1" },
      error: null,
    });
    admin.enqueueResponse({ data: null, error: null });
    admin.enqueueResponse({ data: null, error: null });
    admin.enqueueResponse({ data: null, error: { message: "fk violation" } });

    await expect(deleteStore("s-1")).rejects.toThrow(/fk violation/);
    expect(admin.chainsForTable("activity_logs")).toHaveLength(0);
  });

  it("still completes the delete when the activity log insert fails (best-effort)", async () => {
    asAdmin({ stores: ["delete"] });
    setServerUser({ id: "u-sa", email: "sa@test.com" });
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const admin = getAdminClient();
    const longAgo = new Date();
    longAgo.setDate(longAgo.getDate() - 100);
    admin.enqueueResponse({
      data: { is_active: false, updated_at: longAgo.toISOString(), name: "S1", code: "S1" },
      error: null,
    });
    admin.enqueueResponse({ data: null, error: null });
    admin.enqueueResponse({ data: null, error: null });
    admin.enqueueResponse({ data: null, error: null });
    admin.enqueueResponse({ data: null, error: { message: "log db down" } });

    await expect(deleteStore("s-1")).resolves.not.toThrow();
    expect(consoleSpy).toHaveBeenCalledWith("[activity-log] insert failed:", "log db down");
    consoleSpy.mockRestore();
  });
});

describe("getStoreCategories", () => {
  it("returns the list of categories assigned to a store", async () => {
    asSuperAdmin();
    const admin = getAdminClient();
    admin.enqueueResponse({
      data: [
        { category_id: "c-1", categories: { id: "c-1", name: "Snacks" } },
        { category_id: "c-2", categories: { id: "c-2", name: "Drinks" } },
      ],
      error: null,
    });

    const result = await getStoreCategories("s-1");
    expect(result).toEqual([
      { id: "c-1", name: "Snacks" },
      { id: "c-2", name: "Drinks" },
    ]);
  });

  it("returns empty array when there are no assignments", async () => {
    asSuperAdmin();
    const admin = getAdminClient();
    admin.enqueueResponse({ data: null, error: null });

    expect(await getStoreCategories("s-1")).toEqual([]);
  });
});

describe("getLockedStoreCategories", () => {
  it("returns an empty array when there are no products and no active orders", async () => {
    asSuperAdmin();
    const admin = getAdminClient();
    admin.enqueueResponse({ count: 0, data: [], error: null });
    admin.enqueueResponse({ count: 0, data: [], error: null });

    const result = await getLockedStoreCategories("s-1");
    expect(result).toEqual([]);
  });

  it("classifies a category with only products as 'products'", async () => {
    asSuperAdmin();
    const admin = getAdminClient();
    admin.enqueueResponse({
      count: 3,
      data: [
        { category_id: "c-1" },
        { category_id: "c-1" },
        { category_id: "c-1" },
      ],
      error: null,
    });
    admin.enqueueResponse({ count: 0, data: [], error: null });

    const result = await getLockedStoreCategories("s-1");
    expect(result).toEqual([
      { categoryId: "c-1", reason: "products", productCount: 3, activeOrderCount: 0 },
    ]);
  });

  it("classifies a category with only active orders as 'orders'", async () => {
    asSuperAdmin();
    const admin = getAdminClient();
    admin.enqueueResponse({ count: 0, data: [], error: null });
    admin.enqueueResponse({
      count: 2,
      data: [{ category_id: "c-1" }, { category_id: "c-1" }],
      error: null,
    });

    const result = await getLockedStoreCategories("s-1");
    expect(result).toEqual([
      { categoryId: "c-1", reason: "orders", productCount: 0, activeOrderCount: 2 },
    ]);
  });

  it("classifies a category with both products AND active orders as 'both'", async () => {
    asSuperAdmin();
    const admin = getAdminClient();
    admin.enqueueResponse({
      count: 1,
      data: [{ category_id: "c-1" }],
      error: null,
    });
    admin.enqueueResponse({
      count: 1,
      data: [{ category_id: "c-1" }],
      error: null,
    });

    const result = await getLockedStoreCategories("s-1");
    expect(result).toEqual([
      { categoryId: "c-1", reason: "both", productCount: 1, activeOrderCount: 1 },
    ]);
  });

  it("queries only the active order statuses", async () => {
    asSuperAdmin();
    const admin = getAdminClient();
    admin.enqueueResponse({ count: 0, data: [], error: null });
    admin.enqueueResponse({ count: 0, data: [], error: null });

    await getLockedStoreCategories("s-1");

    const orderItemsChain = admin.chainsForTable("order_items")[0];
    const inCall = orderItemsChain.find((c) => c.method === "in");
    expect(inCall).toEqual({
      method: "in",
      args: [
        "orders.status",
        ["pending", "confirmed", "processing", "out_for_delivery"],
      ],
    });
  });
});

describe("assertCategoriesRemovable", () => {
  it("returns silently when the removed list is empty", async () => {
    asSuperAdmin();
    await expect(assertCategoriesRemovable("s-1", [])).resolves.toBeUndefined();
  });

  it("returns silently when no removed category is locked", async () => {
    asSuperAdmin();
    const admin = getAdminClient();
    admin.enqueueResponse({ count: 0, data: [], error: null });
    admin.enqueueResponse({ count: 0, data: [], error: null });

    await expect(assertCategoriesRemovable("s-1", ["c-1"])).resolves.toBeUndefined();
  });

  it("throws when any removed category is locked by products", async () => {
    asSuperAdmin();
    const admin = getAdminClient();
    admin.enqueueResponse({
      count: 2,
      data: [{ category_id: "c-1" }, { category_id: "c-1" }],
      error: null,
    });
    admin.enqueueResponse({ count: 0, data: [], error: null });

    await expect(
      assertCategoriesRemovable("s-1", ["c-1", "c-2"]),
    ).rejects.toThrow(/Cannot remove .* categor/);
  });

  it("includes product and order counts in the error message", async () => {
    asSuperAdmin();
    const admin = getAdminClient();
    admin.enqueueResponse({
      count: 3,
      data: [{ category_id: "c-1" }, { category_id: "c-1" }, { category_id: "c-1" }],
      error: null,
    });
    admin.enqueueResponse({
      count: 2,
      data: [{ category_id: "c-1" }, { category_id: "c-1" }],
      error: null,
    });

    await expect(
      assertCategoriesRemovable("s-1", ["c-1"]),
    ).rejects.toThrow(/3 product\(s\) and 2 active order\(s\)/);
  });
});

describe("setStoreCategories", () => {
  it("rejects users without stores:edit permission", async () => {
    asAdmin({ stores: ["view"] });
    await expect(setStoreCategories("s-1", ["c-1"])).rejects.toBeInstanceOf(PermissionError);
  });

  it("removes old assignments and inserts new ones when none are locked", async () => {
    asAdmin({ stores: ["edit"] });
    const admin = getAdminClient();
    admin.enqueueResponse({
      data: [{ category_id: "c-1" }, { category_id: "c-2" }],
      error: null,
    });
    admin.enqueueResponse({ data: null, error: null });
    admin.enqueueResponse({ data: null, error: null });

    await setStoreCategories("s-1", ["c-3"]);

    const tablesTouched = admin.calls
      .filter((c) => c.method === "from")
      .map((c) => c.args[0]);
    expect(tablesTouched).toContain("store_categories");
  });

  it("revalidates /settings and /stores", async () => {
    asAdmin({ stores: ["edit"] });
    const admin = getAdminClient();
    admin.enqueueResponse({ data: [], error: null });
    admin.enqueueResponse({ data: null, error: null });
    admin.enqueueResponse({ data: null, error: null });

    await setStoreCategories("s-1", ["c-1"]);
    expect(revalidatePathMock).toHaveBeenCalledWith("/settings");
    expect(revalidatePathMock).toHaveBeenCalledWith("/stores");
  });

  it("throws when the removed list contains a locked category", async () => {
    asAdmin({ stores: ["edit"] });
    const admin = getAdminClient();
    admin.enqueueResponse({
      data: [{ category_id: "c-1" }],
      error: null,
    });
    admin.enqueueResponse({
      count: 1,
      data: [{ category_id: "c-1" }],
      error: null,
    });
    admin.enqueueResponse({ count: 0, data: [], error: null });

    await expect(setStoreCategories("s-1", [])).rejects.toThrow(/Cannot remove/);
  });

  it("throws when the new-insert query fails", async () => {
    asAdmin({ stores: ["edit"] });
    const admin = getAdminClient();
    admin.enqueueResponse({ data: [], error: null });
    admin.enqueueResponse({ data: null, error: null });
    admin.enqueueResponse({ data: null, error: { message: "insert failed" } });

    await expect(setStoreCategories("s-1", ["c-1"])).rejects.toThrow("insert failed");
  });
});

describe("getEligibleManagers", () => {
  it("returns managers (non-Super-Admin role) with a profile, no store", async () => {
    asSuperAdmin();
    const admin = getAdminClient();
    admin.enqueueResponse({
      data: [
        { id: "u-1", full_name: "Alice", email: "alice@x.com", role_id: 2 },
        { id: "u-2", full_name: "Bob", email: "bob@x.com", role_id: 1 },
      ],
      error: null,
    });
    admin.enqueueResponse({
      data: [
        { id: 1, name: "Super Admin" },
        { id: 2, name: "Manager" },
      ],
      error: null,
    });

    const result = await getEligibleManagers();
    expect(result).toEqual([{ id: "u-1", full_name: "Alice", email: "alice@x.com" }]);
  });

  it("returns empty array when data is null", async () => {
    asSuperAdmin();
    const admin = getAdminClient();
    admin.enqueueResponse({ data: null, error: null });

    expect(await getEligibleManagers()).toEqual([]);
  });

  it("returns empty array when there are no role_ids to look up", async () => {
    asSuperAdmin();
    const admin = getAdminClient();
    admin.enqueueResponse({
      data: [{ id: "u-1", full_name: "Alice", email: "alice@x.com", role_id: null }],
      error: null,
    });

    expect(await getEligibleManagers()).toEqual([]);
  });
});
