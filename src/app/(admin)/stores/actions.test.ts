import { describe, it, expect, beforeEach } from "vitest";
import "../../../../test/mocks/supabase-clients";
import "../../../../test/mocks/next-cache";
import "../../../../test/mocks/next-navigation";
import "../../../../test/mocks/require-permission";
import {
  getAdminClient,
  resetSupabaseClients,
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

describe("getStoreRelations", () => {
  it("returns counts of zones and gst numbers", async () => {
    asSuperAdmin();
    const admin = getAdminClient();
    admin.enqueueResponse({ count: 3, data: null, error: null });
    admin.enqueueResponse({ count: 2, data: null, error: null });

    const result = await getStoreRelations("s-1");
    expect(result).toEqual({ zones: 3, gstNumbers: 2 });
  });

  it("defaults to 0 when count is null", async () => {
    asSuperAdmin();
    const admin = getAdminClient();
    admin.enqueueResponse({ count: null, data: null, error: null });
    admin.enqueueResponse({ count: null, data: null, error: null });

    const result = await getStoreRelations("s-1");
    expect(result).toEqual({ zones: 0, gstNumbers: 0 });
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
      data: { is_active: true, updated_at: new Date().toISOString() },
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
      data: { is_active: false, updated_at: recent.toISOString() },
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
      data: { is_active: false, updated_at: longAgo.toISOString() },
      error: null,
    });
    admin.enqueueResponse({ data: null, error: null });
    admin.enqueueResponse({ data: null, error: null });
    admin.enqueueResponse({ data: null, error: null });

    await deleteStore("s-1");

    const tablesTouched = admin.calls
      .filter((c) => c.method === "from")
      .map((c) => c.args[0]);
    expect(tablesTouched).toEqual(["stores", "delivery_zones", "gst_numbers", "stores"]);
  });

  it("revalidates /stores on success", async () => {
    asAdmin({ stores: ["delete"] });
    const admin = getAdminClient();
    const longAgo = new Date();
    longAgo.setDate(longAgo.getDate() - 100);
    admin.enqueueResponse({
      data: { is_active: false, updated_at: longAgo.toISOString() },
      error: null,
    });
    admin.enqueueResponse({ data: null, error: null });
    admin.enqueueResponse({ data: null, error: null });
    admin.enqueueResponse({ data: null, error: null });

    await deleteStore("s-1");
    expect(revalidatePathMock).toHaveBeenCalledWith("/stores");
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
