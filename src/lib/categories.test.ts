import { describe, it, expect, beforeEach } from "vitest";
import "../../test/mocks/supabase-clients";
import {
  getAdminClient,
  resetSupabaseClients,
} from "../../test/mocks/supabase-clients";
import {
  getCategoriesForStore,
  buildEffectiveStoresMap,
} from "./categories";

beforeEach(() => {
  resetSupabaseClients();
});

describe("getCategoriesForStore — Super Admin (storeId = null)", () => {
  it("returns ALL active categories without a store filter", async () => {
    const admin = getAdminClient();
    admin.enqueueResponse({
      data: [
        { id: "a", name: "Alpha", parent_id: null, sort_order: 0 },
        { id: "b", name: "Beta", parent_id: null, sort_order: 1 },
        { id: "sub-a", name: "Sub Alpha", parent_id: "a", sort_order: 0 },
      ],
      error: null,
    });

    const result = await getCategoriesForStore(null);
    expect(result).toHaveLength(3);

    // Asserts the query is unfiltered (no .in, no .eq on parent_id)
    const chain = admin.chainsForTable("categories")[0];
    const orCall = chain.find((c) => c.method === "or");
    expect(orCall).toBeUndefined();
  });
});

describe("getCategoriesForStore — store-scoped (storeId = 's-1')", () => {
  it("returns empty array when no categories are assigned to the store", async () => {
    const admin = getAdminClient();
    admin.enqueueResponse({ data: [], error: null });

    const result = await getCategoriesForStore("s-1");
    expect(result).toEqual([]);
  });

  it("returns the assigned categories only (no children, no other parents)", async () => {
    const admin = getAdminClient();
    // store_categories: only "leaf-1" is assigned (no parent)
    admin.enqueueResponse({
      data: [{ category_id: "leaf-1" }],
      error: null,
    });
    // First BFS level: id IN [leaf-1] OR parent_id IN [leaf-1] → returns just leaf-1
    admin.enqueueResponse({
      data: [{ id: "leaf-1", name: "Leaf", parent_id: null, sort_order: 0 }],
      error: null,
    });
    // No more children → loop terminates

    const result = await getCategoriesForStore("s-1");
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("leaf-1");
  });

  it("includes all descendants of an assigned parent (recursive — children + grandchildren)", async () => {
    const admin = getAdminClient();
    // Assigned: parent-1 (and root-1 which is a sibling, should NOT appear)
    admin.enqueueResponse({
      data: [{ category_id: "parent-1" }],
      error: null,
    });
    // Level 1: parent-1 + its direct children
    admin.enqueueResponse({
      data: [
        { id: "parent-1", name: "Parent", parent_id: null, sort_order: 0 },
        { id: "sub-1", name: "Sub 1", parent_id: "parent-1", sort_order: 0 },
        { id: "sub-2", name: "Sub 2", parent_id: "parent-1", sort_order: 1 },
      ],
      error: null,
    });
    // Level 2: sub-1 + sub-2's children (one has a grandchild)
    admin.enqueueResponse({
      data: [
        { id: "sub-1", name: "Sub 1", parent_id: "parent-1", sort_order: 0 },
        { id: "sub-2", name: "Sub 2", parent_id: "parent-1", sort_order: 1 },
        { id: "grand-1", name: "Grand 1", parent_id: "sub-1", sort_order: 0 },
      ],
      error: null,
    });
    // Level 3: grand-1's children (none) → loop terminates

    const result = await getCategoriesForStore("s-1");
    const ids = result.map((c) => c.id).sort();
    expect(ids).toEqual(["grand-1", "parent-1", "sub-1", "sub-2"].sort());
  });

  it("returns subcategory as a flat option when it is directly assigned but its parent is not", async () => {
    const admin = getAdminClient();
    // Assigned: orphan-sub (a subcategory whose parent is NOT assigned)
    admin.enqueueResponse({
      data: [{ category_id: "orphan-sub" }],
      error: null,
    });
    // Level 1: orphan-sub itself
    admin.enqueueResponse({
      data: [
        { id: "orphan-sub", name: "Orphan Sub", parent_id: "some-other-parent", sort_order: 0 },
      ],
      error: null,
    });

    const result = await getCategoriesForStore("s-1");
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("orphan-sub");
    // "some-other-parent" must NOT appear
    expect(result.find((c) => c.id === "some-other-parent")).toBeUndefined();
  });

  it("does NOT include inactive descendants (is_active = false filter)", async () => {
    const admin = getAdminClient();
    admin.enqueueResponse({
      data: [{ category_id: "parent-1" }],
      error: null,
    });
    // The mock's categories response returns only active rows
    // (the helper's .eq("is_active", true) is applied at the query level)
    admin.enqueueResponse({
      data: [
        { id: "parent-1", name: "Parent", parent_id: null, sort_order: 0 },
        { id: "active-sub", name: "Active Sub", parent_id: "parent-1", sort_order: 0 },
        // inactive-sub is NOT returned by the query (filtered out)
      ],
      error: null,
    });
    // No more children
    admin.enqueueResponse({ data: [], error: null });

    const result = await getCategoriesForStore("s-1");
    const ids = result.map((c) => c.id);
    expect(ids).toContain("active-sub");
    expect(ids).not.toContain("inactive-sub");
  });

  it("dedupes categories that appear in both the assigned set AND as children", async () => {
    const admin = getAdminClient();
    // Assigned: parent-1 AND sub-1 (both explicitly linked)
    admin.enqueueResponse({
      data: [{ category_id: "parent-1" }, { category_id: "sub-1" }],
      error: null,
    });
    // Level 1: parent-1, sub-1, and another child sub-2
    admin.enqueueResponse({
      data: [
        { id: "parent-1", name: "Parent", parent_id: null, sort_order: 0 },
        { id: "sub-1", name: "Sub 1", parent_id: "parent-1", sort_order: 0 },
        { id: "sub-2", name: "Sub 2", parent_id: "parent-1", sort_order: 1 },
      ],
      error: null,
    });
    // Level 2: sub-1, sub-2 (sub-1 is assigned, so its own children are NOT in next frontier
    //          because we skip assignedIds from the next frontier; but sub-1 itself is
    //          already in the visible map so this row is deduped)
    admin.enqueueResponse({
      data: [
        { id: "sub-1", name: "Sub 1", parent_id: "parent-1", sort_order: 0 },
        { id: "sub-2", name: "Sub 2", parent_id: "parent-1", sort_order: 1 },
      ],
      error: null,
    });

    const result = await getCategoriesForStore("s-1");
    const ids = result.map((c) => c.id);
    // Each category should appear exactly once
    expect(ids).toEqual(["parent-1", "sub-1", "sub-2"]);
    // No duplicates
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("uses PostgREST .or() to fetch the frontier + their children in one query per level", async () => {
    const admin = getAdminClient();
    admin.enqueueResponse({ data: [{ category_id: "p-1" }], error: null });
    // First level query
    admin.enqueueResponse({
      data: [
        { id: "p-1", name: "P", parent_id: null, sort_order: 0 },
        { id: "c-1", name: "C", parent_id: "p-1", sort_order: 0 },
      ],
      error: null,
    });
    // No more children
    admin.enqueueResponse({ data: [], error: null });

    await getCategoriesForStore("s-1");

    // Find the .or() call on the categories chain (not the store_categories chain)
    const categoriesChains = admin.chainsForTable("categories");
    const orCalls = categoriesChains.flatMap((chain) => chain.filter((c) => c.method === "or"));
    expect(orCalls.length).toBeGreaterThan(0);
    // First or call: id.in.(p-1),parent_id.in.(p-1)
    expect(orCalls[0].args[0]).toBe("id.in.(p-1),parent_id.in.(p-1)");
  });
});

describe("getCategoriesForStore — sort order", () => {
  it("issues a .order() call on the Super Admin path (DB-side sort)", async () => {
    const admin = getAdminClient();
    admin.enqueueResponse({
      data: [
        { id: "a", name: "Apple", parent_id: null, sort_order: 0 },
      ],
      error: null,
    });

    await getCategoriesForStore(null);

    // The Super Admin branch should issue two .order() calls
    // (sort_order ASC, then name ASC). DB-side sort, not client-side.
    const chain = admin.chainsForTable("categories")[0];
    const orderCalls = chain.filter((c) => c.method === "order");
    expect(orderCalls).toHaveLength(2);
    expect(orderCalls[0].args).toEqual(["sort_order", { ascending: true }]);
    expect(orderCalls[1].args).toEqual(["name"]);
  });

  it("sorts store-scoped results by sort_order ASC, then name ASC (client-side)", async () => {
    const admin = getAdminClient();
    // Assigned: only "p" — returns just p + one sub
    admin.enqueueResponse({
      data: [{ category_id: "p" }],
      error: null,
    });
    // Level 1: 3 results, returned in random order from the mock
    admin.enqueueResponse({
      data: [
        { id: "z", name: "Zebra Sub", parent_id: "p", sort_order: 1 },
        { id: "a", name: "Apple Sub", parent_id: "p", sort_order: 1 },
        { id: "early", name: "Early Sub", parent_id: "p", sort_order: 0 },
      ],
      error: null,
    });
    // Level 2: no new children
    admin.enqueueResponse({ data: [], error: null });

    const result = await getCategoriesForStore("s-1");
    // The store-scoped branch sorts on the client
    expect(result.map((c) => c.id)).toEqual(["early", "a", "z"]);
  });
});

describe("buildEffectiveStoresMap — root categories", () => {
  it("returns an empty map for an empty input", () => {
    const result = buildEffectiveStoresMap([]);
    expect(result.size).toBe(0);
  });

  it("returns own stores for a single root (no parent)", () => {
    const result = buildEffectiveStoresMap([
      { id: "a", parent_id: null, stores: ["Store A", "Store B"] },
    ]);
    expect(result.get("a")).toEqual({
      stores: ["Store A", "Store B"],
      inherited: false,
    });
  });

  it("returns empty stores for a root with no own stores (not inherited)", () => {
    const result = buildEffectiveStoresMap([
      { id: "a", parent_id: null, stores: [] },
    ]);
    expect(result.get("a")).toEqual({ stores: [], inherited: false });
  });
});

describe("buildEffectiveStoresMap — subcategory inheritance", () => {
  it("child inherits the parent's stores when child has no own stores", () => {
    const result = buildEffectiveStoresMap([
      { id: "parent", parent_id: null, stores: ["Store A"] },
      { id: "child", parent_id: "parent", stores: [] },
    ]);
    expect(result.get("parent")?.stores).toEqual(["Store A"]);
    expect(result.get("parent")?.inherited).toBe(false);
    expect(result.get("child")?.stores).toEqual(["Store A"]);
    expect(result.get("child")?.inherited).toBe(true);
  });

  it("child's own stores are appended to the parent's (deduped)", () => {
    const result = buildEffectiveStoresMap([
      { id: "parent", parent_id: null, stores: ["Store A", "Store B"] },
      { id: "child", parent_id: "parent", stores: ["Store B", "Store C"] },
    ]);
    // Ancestor order preserved; child stores appended; duplicates removed
    expect(result.get("child")?.stores).toEqual([
      "Store A",
      "Store B",
      "Store C",
    ]);
    expect(result.get("child")?.inherited).toBe(true);
  });

  it("grandchild inherits through the chain (parent → child → grandchild)", () => {
    const result = buildEffectiveStoresMap([
      { id: "p", parent_id: null, stores: ["Store P"] },
      { id: "c", parent_id: "p", stores: ["Store C"] },
      { id: "g", parent_id: "c", stores: [] },
    ]);
    expect(result.get("g")?.stores).toEqual(["Store P", "Store C"]);
    expect(result.get("g")?.inherited).toBe(true);
  });

  it("child with own stores but empty parent → not inherited", () => {
    const result = buildEffectiveStoresMap([
      { id: "p", parent_id: null, stores: [] },
      { id: "c", parent_id: "p", stores: ["Store C"] },
    ]);
    expect(result.get("c")?.stores).toEqual(["Store C"]);
    // Parent had no stores → nothing to inherit
    expect(result.get("c")?.inherited).toBe(false);
  });

  it("child whose parent is not in the input array → treats parent as empty", () => {
    // E.g. parent is in a different store's scope, so it's filtered out
    // before the page passes rows to the helper.
    const result = buildEffectiveStoresMap([
      { id: "orphan-child", parent_id: "missing-parent", stores: ["Store A"] },
    ]);
    expect(result.get("orphan-child")?.stores).toEqual(["Store A"]);
    expect(result.get("orphan-child")?.inherited).toBe(false);
  });
});

describe("buildEffectiveStoresMap — robustness", () => {
  it("dedupes the same store name appearing at both parent and child", () => {
    const result = buildEffectiveStoresMap([
      { id: "p", parent_id: null, stores: ["Store A"] },
      { id: "c", parent_id: "p", stores: ["Store A", "Store A"] },
    ]);
    // Should be one entry only, not two
    expect(result.get("c")?.stores).toEqual(["Store A"]);
  });

  it("preserves input order on resolve — parent before child", () => {
    // Pass child first to verify resolve() is order-independent.
    const result = buildEffectiveStoresMap([
      { id: "c", parent_id: "p", stores: [] },
      { id: "p", parent_id: null, stores: ["Store A"] },
    ]);
    expect(result.get("c")?.stores).toEqual(["Store A"]);
    expect(result.get("c")?.inherited).toBe(true);
  });

  it("handles a deep chain (5 levels) without stack issues", () => {
    const rows = [
      { id: "l0", parent_id: null, stores: ["Root"] },
      { id: "l1", parent_id: "l0", stores: [] },
      { id: "l2", parent_id: "l1", stores: [] },
      { id: "l3", parent_id: "l2", stores: [] },
      { id: "l4", parent_id: "l3", stores: ["Leaf"] },
    ];
    const result = buildEffectiveStoresMap(rows);
    expect(result.get("l4")?.stores).toEqual(["Root", "Leaf"]);
    expect(result.get("l4")?.inherited).toBe(true);
  });

  it("defends against a cycle in the parent chain (does not infinite-loop)", () => {
    // Build a cycle: a → b → a. In practice this shouldn't happen
    // (categories are a strict tree) but the helper must not infinite-loop.
    const start = Date.now();
    const result = buildEffectiveStoresMap([
      { id: "a", parent_id: "b", stores: ["Store A"] },
      { id: "b", parent_id: "a", stores: ["Store B"] },
    ]);
    const elapsed = Date.now() - start;

    // The key guarantee: returns within a sane budget. Cycle resolution
    // is undefined beyond "contains own stores" — it can't happen in
    // a real category tree.
    expect(elapsed).toBeLessThan(100);
    expect(result.has("a")).toBe(true);
    expect(result.has("b")).toBe(true);
    // At minimum, each category's own stores appear in its result.
    expect(result.get("a")?.stores).toContain("Store A");
    expect(result.get("b")?.stores).toContain("Store B");
  });
});
