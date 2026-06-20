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
      // 5) activity log fetch (P25)
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
      // 5) activity log fetch (P25)
      { data: [], error: null },
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
      // 5) activity log fetch (P25)
      { data: [], error: null },
    );

    asSuperAdmin();
    await EditProductPage({ params: Promise.resolve(mockParams("p-1")) });

    // No store_categories chain should exist
    const storeCatChains = admin.chainsForTable("store_categories");
    expect(storeCatChains).toHaveLength(0);
  });

  it("store-scoped user sees only their store's categories (P23: includes descendants of assigned parents)", async () => {
    const admin = getAdminClient();
    admin.setResponses(
      { data: { id: "p-1", name: "X", category_id: "c-1", store_id: "s-1", categories: { name: "Cat" } }, error: null },
      { data: [], error: null },
      { data: [], error: null },
      // store_categories lookup (the user's store is s-2, NOT the product's s-1)
      { data: [{ category_id: "parent-1" }], error: null },
      // First BFS level: parent-1 + its child
      { data: [
        { id: "parent-1", name: "Snacks", parent_id: null, sort_order: 0 },
        { id: "sub-1", name: "Chips", parent_id: "parent-1", sort_order: 0 },
      ], error: null },
      // Second BFS level: sub-1's children (none) → loop terminates
      { data: [], error: null },
      // 7) activity log fetch (P25)
      { data: [], error: null },
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

    // P23: the helper uses .or() instead of .in("id", ...) to also pick up
    // children of assigned parents. Assert the .or() call exists.
    const categoriesChains = admin.chainsForTable("categories");
    const allOrCalls = categoriesChains.flatMap((c) => c.filter((call) => call.method === "or"));
    expect(allOrCalls.length).toBeGreaterThan(0);
    expect(allOrCalls[0].args[0]).toBe("id.in.(parent-1),parent_id.in.(parent-1)");
  });
});

describe("EditProductPage — 404 handling", () => {
  it("calls notFound() when product doesn't exist", async () => {
    const admin = getAdminClient();
    admin.setResponses({ data: null, error: null });

    asAdmin({ products: ["view"] });
    let caught: unknown = null;
    try {
      await EditProductPage({ params: Promise.resolve(mockParams("missing")) });
    } catch (e) {
      caught = e;
    }
    // Production format: err.digest starts with "NEXT_HTTP_ERROR_FALLBACK;404"
    expect((caught as { digest: string }).digest).toBe("NEXT_HTTP_ERROR_FALLBACK;404");
  });
});

describe("EditProductPage — P25: activity log fetch", () => {
  it("queries activity_logs for the current product (entity_type=product, entity_id=id)", async () => {
    const admin = getAdminClient();
    admin.setResponses(
      // product
      { data: { id: "p-99", name: "Widget", category_id: "c-1", store_id: "s-1", categories: { name: "Cat" } }, error: null },
      // variants
      { data: [], error: null },
      // images
      { data: [], error: null },
      // categories (super admin path — all active)
      { data: [{ id: "c-1", name: "Fruits", parent_id: null, sort_order: 0 }], error: null },
      // activity log (P25) — return 2 entries to prove the render
      { data: [
        { id: 1, user_id: "u-1", action: "create", entity_type: "product", entity_id: "p-99", details: { name: "Widget" }, created_at: "2026-06-19T10:00:00Z", profiles: [{ full_name: "Admin" }] },
        { id: 2, user_id: "u-1", action: "update", entity_type: "product", entity_id: "p-99", details: { fields_received: ["mrp"] }, created_at: "2026-06-19T11:00:00Z", profiles: [{ full_name: "Admin" }] },
      ], error: null },
    );

    asSuperAdmin();
    await EditProductPage({ params: Promise.resolve(mockParams("p-99")) });

    const activityChains = admin.chainsForTable("activity_logs");
    expect(activityChains.length).toBeGreaterThan(0);
    const chain = activityChains[0];
    const entityTypeEq = chain.find((c) => c.method === "eq" && c.args[0] === "entity_type");
    const entityIdEq = chain.find((c) => c.method === "eq" && c.args[0] === "entity_id");
    expect(entityTypeEq?.args[1]).toBe("product");
    expect(entityIdEq?.args[1]).toBe("p-99");
    const orderCall = chain.find((c) => c.method === "order");
    expect(orderCall?.args).toEqual(["created_at", { ascending: false }]);
    const limitCall = chain.find((c) => c.method === "limit");
    expect(limitCall?.args[0]).toBe(100);
  });
});
