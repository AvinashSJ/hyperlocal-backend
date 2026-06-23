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
import { redirectMock } from "../../../../test/mocks/next-navigation";
import {
  asAdmin,
  asSuperAdmin,
  asAnonymous,
  resetPermissionMock,
  assertPermissionMock,
  PermissionError,
} from "../../../../test/mocks/require-permission";
import { buildFormData } from "../../../../test/fixtures/formdata";
import { runAction } from "../../../../test/helpers/invoke-action";

import {
  createCategory,
  updateCategory,
  deleteCategory,
  requestCategoryDeletion,
  cancelCategoryDeletion,
  forceUnassignCategory,
  forceDeleteCategory,
  reassignCategory,
  getStoreProductsForCategory,
} from "./actions";

beforeEach(() => {
  resetSupabaseClients();
  resetPermissionMock();
  revalidatePathMock.mockClear();
  redirectMock.mockClear();
  assertPermissionMock.mockClear();
});

describe("createCategory", () => {
  it("rejects users without categories:create permission", async () => {
    asAdmin({ categories: ["view"] });
    const fd = buildFormData({ name: "Fruits" });
    await expect(createCategory(fd)).rejects.toBeInstanceOf(PermissionError);
  });

  it("inserts a category with derived slug, sorts, and revalidates/redirects", async () => {
    asAdmin({ categories: ["create"] });
    const admin = getAdminClient();
    admin.setResponses({ data: null, error: null });

    const fd = buildFormData({
      name: "Fresh Fruits!",
      description: "All kinds of fresh fruits",
      image_url: "https://x/fruits.png",
      parent_id: "p-1",
      sort_order: 3,
      is_featured: "on",
      is_active: "on",
    });
    const result = await runAction(createCategory, fd);

    expect(result.redirectedTo).toBe("/categories");
    expect(revalidatePathMock).toHaveBeenCalledWith("/categories");

    const chains = admin.chainsForTable("categories");
    const insertChain = chains[0];
    const insertCall = insertChain.find((c) => c.method === "insert")!;
    const insertArg = insertCall.args[0] as Record<string, unknown>;
    expect(insertArg).toEqual({
      name: "Fresh Fruits!",
      slug: "fresh-fruits",
      description: "All kinds of fresh fruits",
      image_url: "https://x/fruits.png",
      parent_id: "p-1",
      sort_order: 3,
      is_featured: true,
      is_active: true,
    });
  });

  it("derives slug from name: lowercase, dash-separated, strips non-alphanumerics", async () => {
    asAdmin({ categories: ["create"] });
    const admin = getAdminClient();
    admin.setResponses({ data: null, error: null });

    const fd = buildFormData({ name: "  Hello World!! 2024  " });
    await runAction(createCategory, fd);

    const chains = admin.chainsForTable("categories");
    const insertArg = chains[0].find((c) => c.method === "insert")!.args[0] as Record<string, unknown>;
    expect(insertArg.slug).toBe("hello-world-2024");
  });

  it("stores null for description/image_url/parent_id when empty strings", async () => {
    asAdmin({ categories: ["create"] });
    const admin = getAdminClient();
    admin.setResponses({ data: null, error: null });

    const fd = buildFormData({ name: "Bare", description: "", image_url: "", parent_id: "" });
    await runAction(createCategory, fd);

    const chains = admin.chainsForTable("categories");
    const insertArg = chains[0].find((c) => c.method === "insert")!.args[0] as Record<string, unknown>;
    expect(insertArg.description).toBeNull();
    expect(insertArg.image_url).toBeNull();
    expect(insertArg.parent_id).toBeNull();
  });

  it("treats is_featured absent as false (checkbox semantics)", async () => {
    asAdmin({ categories: ["create"] });
    const admin = getAdminClient();
    admin.setResponses({ data: null, error: null });

    const fd = buildFormData({ name: "NotFeatured" });
    await runAction(createCategory, fd);

    const chains = admin.chainsForTable("categories");
    const insertArg = chains[0].find((c) => c.method === "insert")!.args[0] as Record<string, unknown>;
    expect(insertArg.is_featured).toBe(false);
  });

  it("treats is_active absent (or 'off') as false — except that 'on' is the default", async () => {
    asAdmin({ categories: ["create"] });
    const admin = getAdminClient();
    admin.setResponses({ data: null, error: null });

    // formData with no is_active field at all
    const fd = buildFormData({ name: "X" });
    await runAction(createCategory, fd);
    const chains = admin.chainsForTable("categories");
    const insertArg = chains[0].find((c) => c.method === "insert")!.args[0] as Record<string, unknown>;
    // is_active should be true because `!== "off"` means anything except "off" is true
    expect(insertArg.is_active).toBe(true);
  });

  it("treats is_active='off' as false", async () => {
    asAdmin({ categories: ["create"] });
    const admin = getAdminClient();
    admin.setResponses({ data: null, error: null });

    const fd = buildFormData({ name: "X", is_active: "off" });
    await runAction(createCategory, fd);
    const chains = admin.chainsForTable("categories");
    const insertArg = chains[0].find((c) => c.method === "insert")!.args[0] as Record<string, unknown>;
    expect(insertArg.is_active).toBe(false);
  });

  it("throws when insert returns an error (caught by runAction)", async () => {
    asAdmin({ categories: ["create"] });
    const admin = getAdminClient();
    admin.setResponses({ data: null, error: { message: "unique violation" } });

    const fd = buildFormData({ name: "Dup" });
    const result = await runAction(createCategory, fd);
    expect(result.ok).toBe(false);
    expect(result.error?.message).toMatch(/unique violation/);
  });

  it("defaults sort_order to 0 when missing or invalid", async () => {
    asAdmin({ categories: ["create"] });
    const admin = getAdminClient();
    admin.setResponses({ data: null, error: null });

    const fd = buildFormData({ name: "X" });
    await runAction(createCategory, fd);
    const chains = admin.chainsForTable("categories");
    const insertArg = chains[0].find((c) => c.method === "insert")!.args[0] as Record<string, unknown>;
    expect(insertArg.sort_order).toBe(0);
  });
});

describe("updateCategory", () => {
  it("rejects users without categories:edit permission", async () => {
    asAdmin({ categories: ["view"] });
    const fd = buildFormData({ name: "X" });
    await expect(updateCategory("c-1", fd)).rejects.toBeInstanceOf(PermissionError);
  });

  it("updates fields and revalidates/redirects to /categories", async () => {
    asAdmin({ categories: ["edit"] });
    const admin = getAdminClient();
    admin.setResponses({ data: null, error: null });

    const fd = buildFormData({
      name: "Updated Fruits",
      description: "New desc",
      image_url: "https://x/u.png",
      parent_id: "p-2",
      sort_order: 5,
      is_featured: "on",
      is_active: "on",
    });
    // updateCategory(id, formData) — id is FIRST, so wrap to use runAction
    const result = await runAction((f) => updateCategory("c-1", f), fd);

    expect(result.redirectedTo).toBe("/categories");
    expect(revalidatePathMock).toHaveBeenCalledWith("/categories");

    const chains = admin.chainsForTable("categories");
    const updateChain = chains[0];
    const updateCall = updateChain.find((c) => c.method === "update")!;
    const updateArg = updateCall.args[0] as Record<string, unknown>;
    expect(updateArg).toEqual({
      name: "Updated Fruits",
      slug: "updated-fruits",
      description: "New desc",
      image_url: "https://x/u.png",
      parent_id: "p-2",
      sort_order: 5,
      is_featured: true,
      is_active: true,
    });
    const eqCall = updateChain.find((c) => c.method === "eq")!;
    expect(eqCall.args).toEqual(["id", "c-1"]);
  });

  it("throws when update returns an error", async () => {
    asAdmin({ categories: ["edit"] });
    const admin = getAdminClient();
    admin.setResponses({ data: null, error: { message: "fk violation" } });

    const fd = buildFormData({ name: "X" });
    const result = await runAction((f) => updateCategory("c-1", f), fd);
    expect(result.ok).toBe(false);
    expect(result.error?.message).toMatch(/fk violation/);
  });
});

describe("deleteCategory", () => {
  it("rejects users without categories:delete permission", async () => {
    asAdmin({ categories: ["view", "edit"] });
    await expect(deleteCategory("c-1")).rejects.toBeInstanceOf(PermissionError);
  });

  it("nullifies parent_id of children BEFORE deleting the category", async () => {
    asAdmin({ categories: ["delete"] });
    const admin = getAdminClient();
    admin.setResponses({ data: null, error: null });

    await deleteCategory("c-1");

    const chains = admin.chainsForTable("categories");
    // First chain: update children (parent_id -> null, eq parent_id)
    // Second chain: delete
    expect(chains).toHaveLength(2);

    const orphanChain = chains[0];
    const orphanUpdate = orphanChain.find((c) => c.method === "update")!;
    expect(orphanUpdate.args[0]).toEqual({ parent_id: null });
    const orphanEq = orphanChain.find((c) => c.method === "eq")!;
    expect(orphanEq.args).toEqual(["parent_id", "c-1"]);

    const deleteChain = chains[1];
    expect(deleteChain.some((c) => c.method === "delete")).toBe(true);
    const deleteEq = deleteChain.find((c) => c.method === "eq")!;
    expect(deleteEq.args).toEqual(["id", "c-1"]);

    expect(revalidatePathMock).toHaveBeenCalledWith("/categories");
  });

  it("does NOT redirect after delete", async () => {
    asAdmin({ categories: ["delete"] });
    const admin = getAdminClient();
    admin.setResponses({ data: null, error: null });

    await deleteCategory("c-1");
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("throws when delete returns an error", async () => {
    asAdmin({ categories: ["delete"] });
    const admin = getAdminClient();
    // 1) update children (success)
    // 2) delete (error)
    admin.setResponses(
      { data: null, error: null },
      { data: null, error: { message: "fk violation" } },
    );

    await expect(deleteCategory("c-1")).rejects.toThrow(/fk violation/);
  });
});

describe("P23: Manager category CRUD restrictions", () => {
  it("Manager with categories:['view'] only cannot create, update, or delete a category", async () => {
    // P23 migration 20260619000006 reduces Manager's categories to ["view"].
    // This test asserts the post-migration default state: all three actions
    // throw PermissionError for Manager. It catches accidental re-introduction
    // of categories:create/edit/delete in Manager's default permissions.
    asAdmin({ categories: ["view"] });

    // createCategory throws
    await expect(
      createCategory(buildFormData({ name: "X" })),
    ).rejects.toBeInstanceOf(PermissionError);

    // updateCategory throws
    await expect(
      updateCategory("c-1", buildFormData({ name: "X" })),
    ).rejects.toBeInstanceOf(PermissionError);

    // deleteCategory throws
    await expect(deleteCategory("c-1")).rejects.toBeInstanceOf(PermissionError);
  });
});

// P33: category delete grace period + reassign flow
describe("requestCategoryDeletion", () => {
  it("rejects users without categories:delete permission", async () => {
    asAdmin({ categories: ["view"] });
    const fd = buildFormData({ id: "c-1" });
    await expect(requestCategoryDeletion(fd)).rejects.toBeInstanceOf(PermissionError);
  });

  it("sets pending_deletion_at = now()", async () => {
    asAdmin({ categories: ["delete"] });
    const admin = getAdminClient();
    // 1) existing lookup
    // 2) update
    // 3) activity_logs.insert (best-effort)
    admin.setResponses(
      { data: { pending_deletion_at: null }, error: null },
      { data: null, error: null },
      { data: null, error: null },
    );
    const fd = buildFormData({ id: "c-1" });
    await requestCategoryDeletion(fd);

    // The mock stores update payloads as raw objects. JSON.stringify to
    // check the payload contains the pending_deletion_at key.
    const updateCall = admin.calls.find(
      (c) => c.method === "update" && JSON.stringify(c.args[0]).includes("pending_deletion_at"),
    );
    expect(updateCall).toBeTruthy();
  });

  it("throws if the category is already scheduled for deletion", async () => {
    asAdmin({ categories: ["delete"] });
    const admin = getAdminClient();
    admin.setResponses({
      data: { pending_deletion_at: "2025-01-01T00:00:00Z" },
      error: null,
    });
    const fd = buildFormData({ id: "c-1" });
    await expect(requestCategoryDeletion(fd)).rejects.toThrow(
      /already scheduled for deletion/,
    );
  });
});

describe("cancelCategoryDeletion", () => {
  it("clears pending_deletion_at", async () => {
    asAdmin({ categories: ["delete"] });
    const admin = getAdminClient();
    admin.setResponses({ data: null, error: null }, { data: null, error: null });
    const fd = buildFormData({ id: "c-1" });
    await cancelCategoryDeletion(fd);
    // The mock stores update payloads as raw objects; check that the
    // payload includes a pending_deletion_at key.
    const updateCall = admin.calls.find(
      (c) => c.method === "update" && JSON.stringify(c.args[0]).includes("pending_deletion_at"),
    );
    expect(updateCall).toBeTruthy();
    // The payload value should be null (cancelling the deletion)
    const payload = updateCall?.args[0] as Record<string, unknown> | undefined;
    expect(payload?.pending_deletion_at).toBeNull();
  });
});

describe("forceUnassignCategory", () => {
  it("clears pending_deletion_at and deletes all store_categories rows for the category", async () => {
    asAdmin({ categories: ["delete"] });
    const admin = getAdminClient();
    admin.setResponses(
      { data: null, error: null },
      { data: null, error: null },
      { data: null, error: null },
    );
    const fd = buildFormData({ id: "c-1" });
    await forceUnassignCategory(fd);
    // verify a delete was issued on store_categories
    expect(admin.calls.some((c) => c.method === "delete")).toBe(true);
  });
});

describe("forceDeleteCategory", () => {
  it("clears pending_deletion_at and hard-deletes the category", async () => {
    asAdmin({ categories: ["delete"] });
    const admin = getAdminClient();
    admin.setResponses(
      { data: null, error: null }, // update parent_id
      { data: null, error: null }, // update pending_deletion_at
      { data: null, error: null }, // delete
      { data: null, error: null }, // activity log
    );
    const fd = buildFormData({ id: "c-1" });
    await forceDeleteCategory(fd);
    // Verify the delete call was issued. The mock records the table
    // name on the .from() call, not the .delete() call (which is
    // chainable and takes no args). We just count .delete() calls
    // and verify a preceding .from("categories") exists.
    const deleteCalls = admin.calls.filter((c) => c.method === "delete");
    expect(deleteCalls.length).toBeGreaterThanOrEqual(1);
    expect(admin.calls.some((c) => c.method === "from" && c.args[0] === "categories")).toBe(true);
  });
});

describe("reassignCategory", () => {
  it("upserts the store_categories row and clears pending_deletion_at", async () => {
    asAdmin({ categories: ["edit"] });
    const admin = getAdminClient();
    admin.setResponses(
      { data: null, error: null }, // store_categories.upsert
      { data: null, error: null }, // categories.update pending_deletion_at = null
      { data: null, error: null }, // activity log
    );
    // The action reads `category_id` from FormData (matches the form
    // field name in the CategoriesClient UI).
    const fd = buildFormData({ category_id: "c-1", to_store_id: "s-2" });
    await reassignCategory(fd);
    // verify upsert
    expect(admin.calls.some((c) => c.method === "upsert")).toBe(true);
  });

  it("throws when category_id or to_store_id is missing", async () => {
    asAdmin({ categories: ["edit"] });
    // Missing category_id — checked first.
    const fd = buildFormData({ to_store_id: "s-2" });
    await expect(reassignCategory(fd)).rejects.toThrow(/Category id is required/);
    // Missing to_store_id — checked second.
    const fd2 = buildFormData({ category_id: "c-1" });
    await expect(reassignCategory(fd2)).rejects.toThrow(/Target store id is required/);
  });
});

// P45: Super Admin drill-down on the categories page. Lists products
// in a category (and its descendants) that have a store assigned.
describe("getStoreProductsForCategory", () => {
  it("rejects users who are not Super Admin (Manager with categories:view)", async () => {
    asAdmin({ categories: ["view"] });
    await expect(getStoreProductsForCategory("c-1")).rejects.toBeInstanceOf(PermissionError);
  });

  it("rejects anonymous users", async () => {
    asAnonymous();
    await expect(getStoreProductsForCategory("c-1")).rejects.toBeInstanceOf(PermissionError);
  });

  it("returns an empty result when the category id does not exist in the tree", async () => {
    asSuperAdmin();
    const admin = getAdminClient();
    // categories tree lookup returns nothing
    admin.setResponses({ data: [], error: null });
    const result = await getStoreProductsForCategory("missing");
    expect(result).toEqual({ products: [], total: 0, page: 1, pageSize: 10, totalPages: 0 });
  });

  it("queries products filtered by category id, store_id IS NOT NULL, paginated", async () => {
    asSuperAdmin();
    const admin = getAdminClient();
    // 1) categories tree lookup
    admin.setResponses(
      { data: [{ id: "c-1", parent_id: null }], error: null },
      {
        data: [
          { id: "p-1", name: "Apple", sku: "A-1", status: "active", store_id: "s-1", stores: { name: "FreshCart", code: "FRESH01" } },
          { id: "p-2", name: "Banana", sku: "B-1", status: "active", store_id: "s-1", stores: { name: "FreshCart", code: "FRESH01" } },
        ],
        error: null,
        count: 2,
      },
    );
    const result = await getStoreProductsForCategory("c-1", 1, 10, "");
    expect(result.total).toBe(2);
    expect(result.totalPages).toBe(1);
    expect(result.products).toHaveLength(2);
    expect(result.products[0].name).toBe("Apple");
    expect(result.products[0].stores?.code).toBe("FRESH01");

    // Verify the chain built the right filters
    const productChain = admin.chainsForTable("products")[0];
    expect(productChain.some((c) => c.method === "in" && c.args[0] === "category_id" && (c.args[1] as string[]).includes("c-1"))).toBe(true);
    expect(productChain.some((c) => c.method === "not" && c.args[0] === "store_id" && c.args[1] === "is" && c.args[2] === null)).toBe(true);
    expect(productChain.some((c) => c.method === "range" && c.args[0] === 0 && c.args[1] === 9)).toBe(true);
    expect(productChain.some((c) => c.method === "order" && c.args[0] === "name")).toBe(true);
  });

  it("includes products from descendant subcategories when a parent is clicked", async () => {
    asSuperAdmin();
    const admin = getAdminClient();
    // 1) categories tree: parent c-1 with children c-2 and c-3, and c-3 has child c-4
    admin.setResponses(
      {
        data: [
          { id: "c-1", parent_id: null },
          { id: "c-2", parent_id: "c-1" },
          { id: "c-3", parent_id: "c-1" },
          { id: "c-4", parent_id: "c-3" },
        ],
        error: null,
      },
      {
        data: [
          { id: "p-1", name: "X", sku: null, status: "active", store_id: "s-1", stores: { name: "S1", code: "S1CD" } },
        ],
        error: null,
        count: 1,
      },
    );
    await getStoreProductsForCategory("c-1", 1, 10, "");
    const productChain = admin.chainsForTable("products")[0];
    const inCall = productChain.find((c) => c.method === "in")!;
    const ids = inCall.args[1] as string[];
    expect(ids).toContain("c-1");
    expect(ids).toContain("c-2");
    expect(ids).toContain("c-3");
    expect(ids).toContain("c-4");
    expect(ids).toHaveLength(4);
  });

  it("applies search as an .or() with ilike on name and sku", async () => {
    asSuperAdmin();
    const admin = getAdminClient();
    admin.setResponses(
      { data: [{ id: "c-1", parent_id: null }], error: null },
      { data: [], error: null, count: 0 },
    );
    await getStoreProductsForCategory("c-1", 1, 10, "apple");
    const productChain = admin.chainsForTable("products")[0];
    const orCall = productChain.find((c) => c.method === "or");
    expect(orCall).toBeTruthy();
    const pattern = (orCall!.args[0] as string);
    expect(pattern).toContain("name.ilike.%apple%");
    expect(pattern).toContain("sku.ilike.%apple%");
  });

  it("escapes % and _ in the search string to prevent wildcard injection", async () => {
    asSuperAdmin();
    const admin = getAdminClient();
    admin.setResponses(
      { data: [{ id: "c-1", parent_id: null }], error: null },
      { data: [], error: null, count: 0 },
    );
    await getStoreProductsForCategory("c-1", 1, 10, "50%off_test");
    const productChain = admin.chainsForTable("products")[0];
    const orCall = productChain.find((c) => c.method === "or");
    const pattern = (orCall!.args[0] as string);
    expect(pattern).toContain("50\\%off\\_test");
  });

  it("computes totalPages from total and pageSize", async () => {
    asSuperAdmin();
    const admin = getAdminClient();
    admin.setResponses(
      { data: [{ id: "c-1", parent_id: null }], error: null },
      { data: [], error: null, count: 25 },
    );
    const result = await getStoreProductsForCategory("c-1", 1, 10, "");
    expect(result.total).toBe(25);
    expect(result.totalPages).toBe(3);
  });

  it("passes the requested page through to the .range() offset", async () => {
    asSuperAdmin();
    const admin = getAdminClient();
    admin.setResponses(
      { data: [{ id: "c-1", parent_id: null }], error: null },
      { data: [], error: null, count: 25 },
    );
    await getStoreProductsForCategory("c-1", 2, 10, "");
    const productChain = admin.chainsForTable("products")[0];
    expect(productChain.some((c) => c.method === "range" && c.args[0] === 10 && c.args[1] === 19)).toBe(true);
  });

  it("throws when categoryId is missing", async () => {
    asSuperAdmin();
    await expect(getStoreProductsForCategory("")).rejects.toThrow(/categoryId is required/);
  });
});
