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

  it("store-scoped user sees only their store's categories", async () => {
    const admin = getAdminClient();
    admin.setResponses(
      // store_categories lookup
      { data: [{ category_id: "c-1" }], error: null },
      // categories fetch (filtered by .in("id", ...))
      { data: [{ id: "c-1", name: "MyStoreCat", parent_id: null, sort_order: 0 }], error: null },
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

    // Categories fetch should be filtered by .in("id", [c-1])
    // (Mock limitation B19: chainsForTable groups calls by from() boundaries.
    // The .in() call happens after store_categories' from() so it ends up
    // grouped with store_categories. We count via admin.calls instead.)
    const inCalls = admin.calls.filter((c) => c.method === "in");
    const idInCall = inCalls.find((c) => c.args[0] === "id");
    expect(idInCall).toBeDefined();
    expect(idInCall!.args[1]).toEqual(["c-1"]);
  });
});
