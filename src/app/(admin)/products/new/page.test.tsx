import { describe, it, expect, beforeEach, vi } from "vitest";
import "../../../../../test/mocks/supabase-clients";
import "../../../../../test/mocks/next-cache";
import "../../../../../test/mocks/next-navigation";
import "../../../../../test/mocks/require-permission";

const mockGetStoreScope = vi.fn();
vi.mock("@/lib/store-scope", () => ({
  getStoreScope: () => mockGetStoreScope(),
}));

import {
  getAdminClient,
  resetSupabaseClients,
} from "../../../../../test/mocks/supabase-clients";
import {
  asAdmin,
  asSuperAdmin,
  asAnonymous,
  resetPermissionMock,
} from "../../../../../test/mocks/require-permission";

import NewProductPage from "./page";

beforeEach(() => {
  resetSupabaseClients();
  resetPermissionMock();
  mockGetStoreScope.mockReset();
  mockGetStoreScope.mockResolvedValue({ storeId: null, isStoreScoped: false });
});

describe("NewProductPage — permission gating", () => {
  it("calls requirePermission('products', 'view')", async () => {
    const admin = getAdminClient();
    admin.setResponses(
      { data: [
        { id: "c-1", name: "Fruits", parent_id: null, sort_order: 0 },
      ], error: null },
    );

    asAdmin({ products: ["view"] });
    const { requirePermissionMock } = await import("../../../../../test/mocks/require-permission");
    await NewProductPage();

    expect(requirePermissionMock).toHaveBeenCalledWith("products", "view");
  });

  it("rejects anonymous users", async () => {
    asAnonymous();
    await expect(NewProductPage()).rejects.toBeInstanceOf(Error);
  });
});

describe("NewProductPage — category scope", () => {
  it("superadmin sees ALL active categories (no store_categories lookup)", async () => {
    const admin = getAdminClient();
    admin.setResponses({
      data: [
        { id: "c-1", name: "Fruits", parent_id: null, sort_order: 0 },
        { id: "c-2", name: "Vegetables", parent_id: null, sort_order: 1 },
      ],
      error: null,
    });

    asSuperAdmin();
    mockGetStoreScope.mockResolvedValue({ storeId: null, isStoreScoped: false });
    await NewProductPage();

    // No store_categories chain should exist
    const storeCatChains = admin.chainsForTable("store_categories");
    expect(storeCatChains).toHaveLength(0);

    // Categories chain should NOT have any store filter
    const catChains = admin.chainsForTable("categories");
    expect(catChains).toHaveLength(1);
    const catChain = catChains[0];
    expect(catChain.some((c) => c.method === "eq" && c.args[0] === "store_id")).toBe(false);
    expect(catChain.some((c) => c.method === "in")).toBe(false);
  });

  it("store-scoped user sees only their store's categories (P23: includes descendants of assigned parents)", async () => {
    const admin = getAdminClient();
    admin.setResponses(
      // store_categories lookup
      { data: [{ category_id: "parent-1" }], error: null },
      // First BFS level: parent-1 + its direct child
      { data: [
        { id: "parent-1", name: "Snacks", parent_id: null, sort_order: 0 },
        { id: "sub-1", name: "Chips", parent_id: "parent-1", sort_order: 0 },
      ], error: null },
      // Second BFS level: sub-1's children (none) → loop terminates
      { data: [], error: null },
    );

    asAdmin({ products: ["view"] });
    mockGetStoreScope.mockResolvedValue({ storeId: "s-1", isStoreScoped: true });
    await NewProductPage();

    // store_categories should be queried with the user's store
    const storeCatChains = admin.chainsForTable("store_categories");
    expect(storeCatChains).toHaveLength(1);
    const eqCall = storeCatChains[0].find((c) => c.method === "eq");
    expect(eqCall).toBeDefined();
    expect(eqCall!.args).toEqual(["store_id", "s-1"]);

    // P23: the helper uses .or() instead of .in("id", ...) to also pick up
    // children of assigned parents. Assert the .or() call exists on the
    // categories chain (chainsForTable groups by from() boundaries).
    const categoriesChains = admin.chainsForTable("categories");
    const allOrCalls = categoriesChains.flatMap((c) => c.filter((call) => call.method === "or"));
    expect(allOrCalls.length).toBeGreaterThan(0);
    // First BFS level: id IN (parent-1) OR parent_id IN (parent-1)
    expect(allOrCalls[0].args[0]).toBe("id.in.(parent-1),parent_id.in.(parent-1)");
  });
});
