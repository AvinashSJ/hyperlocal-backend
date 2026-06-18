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
  resetPermissionMock,
  assertPermissionMock,
  PermissionError,
} from "../../../../test/mocks/require-permission";
import { buildFormData } from "../../../../test/fixtures/formdata";
import { runAction } from "../../../../test/helpers/invoke-action";

import { createCategory, updateCategory, deleteCategory } from "./actions";

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
