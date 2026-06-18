import { describe, it, expect, beforeEach, vi } from "vitest";
import "../../../../../test/mocks/supabase-clients";
import "../../../../../test/mocks/next-cache";
import "../../../../../test/mocks/next-navigation";
import "../../../../../test/mocks/require-permission";

// Mock getStoreScope BEFORE importing the page module so the page uses the mocked version
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

import EditProductPage from "./page";

const mockParams = (id: string) => ({ id });

beforeEach(() => {
  resetSupabaseClients();
  resetPermissionMock();
  mockGetStoreScope.mockReset();
  // Default: superadmin (no store scope)
  mockGetStoreScope.mockResolvedValue({ storeId: null, isStoreScoped: false });
});

describe("EditProductPage — permission gating", () => {
  it("calls requirePermission('products', 'view')", async () => {
    const admin = getAdminClient();
    admin.setResponses(
      { data: { id: "p-1", name: "Test", category_id: "c-1", store_id: "s-1", categories: { name: "Test Cat" } }, error: null },
      { data: [], error: null },
      { data: [], error: null },
      { data: [], error: null },
    );

    asAdmin({ products: ["view"] });
    const { requirePermissionMock } = await import("../../../../../test/mocks/require-permission");
    await EditProductPage({ params: Promise.resolve(mockParams("p-1")) });

    expect(requirePermissionMock).toHaveBeenCalledWith("products", "view");
  });

  it("rejects anonymous users (PermissionError)", async () => {
    asAnonymous();
    await expect(
      EditProductPage({ params: Promise.resolve(mockParams("p-1")) }),
    ).rejects.toBeInstanceOf(Error);
  });
});

describe("EditProductPage — category scope (REGRESSION for B1: 'category dropdown is not visible')", () => {
  it("uses USER's effective store scope, NOT the product's store_id", async () => {
    const admin = getAdminClient();
    // Product belongs to store-1
    admin.setResponses(
      { data: { id: "p-1", name: "X", category_id: "c-1", store_id: "s-1", categories: { name: "Cat" } }, error: null },
      { data: [], error: null },
      { data: [], error: null },
      // 4) categories fetch — should NOT be filtered by store-1
      { data: [{ id: "c-1", name: "Cat1", parent_id: null, sort_order: 0 }], error: null },
    );

    // User is a superadmin (no store scope) — but the page should pass null storeId
    asSuperAdmin();
    mockGetStoreScope.mockResolvedValue({ storeId: null, isStoreScoped: false });

    await EditProductPage({ params: Promise.resolve(mockParams("p-1")) });

    const categoriesChains = admin.chainsForTable("categories");
    // Only ONE categories chain (not two — no store_categories lookup for superadmin)
    expect(categoriesChains).toHaveLength(1);
    const catChain = categoriesChains[0];
    // The chain should NOT have a .eq("store_id", ...) or a .in("id", ...) — just the active filter
    expect(catChain.some((c) => c.method === "eq" && c.args[0] === "store_id")).toBe(false);
    expect(catChain.some((c) => c.method === "in" && c.args[0] === "id")).toBe(false);
  });

  it("superadmin sees ALL active categories (no store_categories lookup)", async () => {
    const admin = getAdminClient();
    admin.setResponses(
      { data: { id: "p-1", name: "X", category_id: "c-1", store_id: "s-1", categories: { name: "Cat" } }, error: null },
      { data: [], error: null },
      { data: [], error: null },
      { data: [
        { id: "c-1", name: "Fruits", parent_id: null, sort_order: 0 },
        { id: "c-2", name: "Vegetables", parent_id: null, sort_order: 1 },
        { id: "c-3", name: "Dairy", parent_id: null, sort_order: 2 },
      ], error: null },
    );

    asSuperAdmin();
    await EditProductPage({ params: Promise.resolve(mockParams("p-1")) });

    // No store_categories chain should exist
    const storeCatChains = admin.chainsForTable("store_categories");
    expect(storeCatChains).toHaveLength(0);
  });

  it("store-scoped user sees only their store's categories", async () => {
    const admin = getAdminClient();
    admin.setResponses(
      { data: { id: "p-1", name: "X", category_id: "c-1", store_id: "s-1", categories: { name: "Cat" } }, error: null },
      { data: [], error: null },
      { data: [], error: null },
      // store_categories lookup
      { data: [{ category_id: "c-1" }, { category_id: "c-2" }], error: null },
      // categories fetch filtered by .in("id", [...])
      { data: [
        { id: "c-1", name: "Cat1", parent_id: null, sort_order: 0 },
        { id: "c-2", name: "Cat2", parent_id: null, sort_order: 1 },
      ], error: null },
    );

    asAdmin({ products: ["view"] });
    // User is scoped to store-2 (not store-1 like the product!)
    mockGetStoreScope.mockResolvedValue({ storeId: "s-2", isStoreScoped: true });

    await EditProductPage({ params: Promise.resolve(mockParams("p-1")) });

    // store_categories should be queried with the USER's store (s-2), not product's (s-1)
    const storeCatChains = admin.chainsForTable("store_categories");
    expect(storeCatChains).toHaveLength(1);
    const storeCatChain = storeCatChains[0];
    const eqCall = storeCatChain.find((c) => c.method === "eq");
    expect(eqCall).toBeDefined();
    expect(eqCall!.args).toEqual(["store_id", "s-2"]);

    // Categories fetch should have .in("id", [c-1, c-2]) — but the call
    // happens AFTER the store_categories' from() in the outer calls list,
    // so chainsForTable groups it with store_categories (mock limitation B19).
    // Workaround: count calls in admin.calls filtered by args.
    const allInCalls = admin.calls.filter((c) => c.method === "in");
    const idInCall = allInCalls.find((c) => c.args[0] === "id");
    expect(idInCall).toBeDefined();
    expect(idInCall!.args[1]).toEqual(["c-1", "c-2"]);
  });
});

describe("EditProductPage — 404 handling", () => {
  it("calls notFound() when product doesn't exist", async () => {
    const admin = getAdminClient();
    admin.setResponses({ data: null, error: null });

    asAdmin({ products: ["view"] });
    await expect(
      EditProductPage({ params: Promise.resolve(mockParams("missing")) }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
  });
});
