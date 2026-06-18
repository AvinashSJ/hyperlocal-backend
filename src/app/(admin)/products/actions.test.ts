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
import { buildFormData } from "../../../../test/fixtures/formdata";
import { makeProduct, makeCategory } from "../../../../test/fixtures/factories";
import { runAction } from "../../../../test/helpers/invoke-action";

import {
  createProduct,
  updateProduct,
  deleteProduct,
  bulkImportProducts,
} from "./actions";

beforeEach(() => {
  resetSupabaseClients();
  resetPermissionMock();
  revalidatePathMock.mockClear();
  assertPermissionMock.mockClear();
});

describe("createProduct", () => {
  it("rejects users without products:create permission", async () => {
    asAdmin({ products: ["view"] });
    const fd = buildFormData({ name: "Test", category_id: "c-1" });
    await expect(createProduct(fd)).rejects.toBeInstanceOf(PermissionError);
  });

  it("throws when name is missing", async () => {
    asAdmin({ products: ["create"] });
    const fd = buildFormData({ name: "", category_id: "c-1" });
    await expect(createProduct(fd)).rejects.toThrow(/Product name is required/);
  });

  it("throws when category_id is missing", async () => {
    asAdmin({ products: ["create"] });
    const fd = buildFormData({ name: "Test", category_id: "" });
    await expect(createProduct(fd)).rejects.toThrow(/Category is required/);
  });

  it("inserts a product and revalidates /products (note: source declares productSlug but does not store it)", async () => {
    asAdmin({ products: ["create"] });
    const admin = getAdminClient();
    admin.enqueueResponse({ data: { id: "store-1" }, error: null });
    admin.enqueueResponse({ data: { id: "new-prod" }, error: null });
    admin.enqueueResponse({ data: null, error: null });

    const fd = buildFormData({
      name: "Whole Wheat Bread",
      category_id: "c-1",
      mrp: 60,
      selling_price: 50,
    });
    await runAction(createProduct, fd);

    const insertArg = admin.chainsForTable("products")[0]
      .find((c) => c.method === "insert")!.args[0] as Record<string, unknown>;
    expect(insertArg.name).toBe("Whole Wheat Bread");
    expect(insertArg.store_id).toBe("store-1");
    expect(insertArg.status).toBe("active");
    expect(insertArg).not.toHaveProperty("slug");
    expect(revalidatePathMock).toHaveBeenCalledWith("/products");
  });

  it("inserts variants when provided", async () => {
    asAdmin({ products: ["create"] });
    const admin = getAdminClient();
    admin.enqueueResponse({ data: { id: "store-1" }, error: null });
    admin.enqueueResponse({ data: { id: "p-1" }, error: null });
    admin.enqueueResponse({ data: null, error: null });
    admin.enqueueResponse({ data: null, error: null });

    const variants = JSON.stringify([
      { name: "500g", sku: "BREAD-500", price: 50, stock: 100, variant_attributes: { weight: "500g" } },
      { name: "1kg", sku: "BREAD-1K", price: 95, stock: 50, variant_attributes: { weight: "1kg" } },
    ]);
    const fd = buildFormData({
      name: "Whole Wheat Bread",
      category_id: "c-1",
      variants,
    });
    await runAction(createProduct, fd);

    const variantInserts = admin.chainsForTable("product_variants");
    expect(variantInserts).toHaveLength(1);
    const rows = variantInserts[0].find((c) => c.method === "insert")!.args[0] as any[];
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      product_id: "p-1",
      name: "500g",
      sku: "BREAD-500",
      price: 50,
      stock: 100,
    });
  });

  it("inserts images when provided", async () => {
    asAdmin({ products: ["create"] });
    const admin = getAdminClient();
    admin.enqueueResponse({ data: { id: "store-1" }, error: null });
    admin.enqueueResponse({ data: { id: "p-1" }, error: null });
    admin.enqueueResponse({ data: null, error: null });
    admin.enqueueResponse({ data: null, error: null });

    const images = JSON.stringify([
      { image_url: "https://x/a.jpg", is_primary: true, sort_order: 0 },
      { image_url: "https://x/b.jpg", is_primary: false, sort_order: 1 },
    ]);
    const fd = buildFormData({
      name: "Whole Wheat Bread",
      category_id: "c-1",
      images,
    });
    await runAction(createProduct, fd);

    const imageInserts = admin.chainsForTable("product_images");
    expect(imageInserts).toHaveLength(1);
    const rows = imageInserts[0].find((c) => c.method === "insert")!.args[0] as any[];
    expect(rows).toHaveLength(2);
  });

  it("ignores malformed variants JSON", async () => {
    asAdmin({ products: ["create"] });
    const admin = getAdminClient();
    admin.enqueueResponse({ data: { id: "store-1" }, error: null });
    admin.enqueueResponse({ data: { id: "p-1" }, error: null });
    admin.enqueueResponse({ data: null, error: null });

    const fd = buildFormData({
      name: "Test",
      category_id: "c-1",
      variants: "not valid json",
    });
    await runAction(createProduct, fd);

    const variantInserts = admin.chainsForTable("product_variants");
    expect(variantInserts).toHaveLength(0);
  });

  it("sets store_id to null when no store exists", async () => {
    asAdmin({ products: ["create"] });
    const admin = getAdminClient();
    admin.enqueueResponse({ data: null, error: { message: "no rows" } });
    admin.enqueueResponse({ data: { id: "p-1" }, error: null });
    admin.enqueueResponse({ data: null, error: null });

    const fd = buildFormData({ name: "Test", category_id: "c-1" });
    await runAction(createProduct, fd);

    const insertArg = admin.chainsForTable("products")[0]
      .find((c) => c.method === "insert")!.args[0] as Record<string, unknown>;
    expect(insertArg.store_id).toBeNull();
  });

  it("throws when the product insert fails", async () => {
    asAdmin({ products: ["create"] });
    const admin = getAdminClient();
    admin.enqueueResponse({ data: { id: "store-1" }, error: null });
    admin.enqueueResponse({ data: null, error: { message: "insert failed" } });

    const fd = buildFormData({ name: "Test", category_id: "c-1" });
    await expect(createProduct(fd)).rejects.toThrow("insert failed");
  });
});

describe("updateProduct", () => {
  it("rejects users without products:edit permission", async () => {
    asAdmin({ products: ["view"] });
    const fd = buildFormData({ name: "Test" });
    await expect(updateProduct("p-1", fd)).rejects.toBeInstanceOf(PermissionError);
  });

  it("throws when name is missing", async () => {
    asAdmin({ products: ["edit"] });
    const fd = buildFormData({ name: "" });
    await expect(updateProduct("p-1", fd)).rejects.toThrow(/Product name is required/);
  });

  it("updates the product, deletes-then-inserts variants and images", async () => {
    asAdmin({ products: ["edit"] });
    const admin = getAdminClient();
    admin.enqueueResponse({ data: null, error: null });
    admin.enqueueResponse({ data: null, error: null });
    admin.enqueueResponse({ data: null, error: null });
    admin.enqueueResponse({ data: null, error: null });
    admin.enqueueResponse({ data: null, error: null });
    admin.enqueueResponse({ data: null, error: null });

    const variants = JSON.stringify([{ name: "New", sku: "X", price: 10, stock: 1, variant_attributes: {} }]);
    const images = JSON.stringify([{ image_url: "https://x/a.jpg", is_primary: true, sort_order: 0 }]);
    const fd = buildFormData({
      name: "Updated",
      mrp: 100,
      variants,
      images,
    });
    await runAction((fd) => updateProduct("p-1", fd), fd);

    const tablesTouched = admin.calls
      .filter((c) => c.method === "from")
      .map((c) => c.args[0]);
    expect(tablesTouched).toContain("products");
    expect(tablesTouched).toContain("product_variants");
    expect(tablesTouched).toContain("product_images");

    const productUpdate = admin.chainsForTable("products")[0]
      .find((c) => c.method === "update")!.args[0] as Record<string, unknown>;
    expect(productUpdate.name).toBe("Updated");

    const variantDelete = admin.chainsForTable("product_variants")[0]
      .find((c) => c.method === "delete");
    expect(variantDelete).toBeDefined();

    const variantInsert = admin.chainsForTable("product_variants")[1]
      .find((c) => c.method === "insert")!.args[0] as any[];
    expect(variantInsert[0].name).toBe("New");

    const imageDelete = admin.chainsForTable("product_images")[0]
      .find((c) => c.method === "delete");
    expect(imageDelete).toBeDefined();

    const imageInsert = admin.chainsForTable("product_images")[1]
      .find((c) => c.method === "insert")!.args[0] as any[];
    expect(imageInsert[0].image_url).toBe("https://x/a.jpg");
  });

  it("revalidates /products", async () => {
    asAdmin({ products: ["edit"] });
    const admin = getAdminClient();
    admin.enqueueResponse({ data: null, error: null });
    admin.enqueueResponse({ data: null, error: null });
    admin.enqueueResponse({ data: null, error: null });
    admin.enqueueResponse({ data: null, error: null });
    admin.enqueueResponse({ data: null, error: null });
    admin.enqueueResponse({ data: null, error: null });

    const fd = buildFormData({ name: "Test" });
    await runAction((fd) => updateProduct("p-1", fd), fd);
    expect(revalidatePathMock).toHaveBeenCalledWith("/products");
  });
});

describe("deleteProduct", () => {
  it("rejects users without products:delete permission", async () => {
    asAdmin({ products: ["view", "edit"] });
    await expect(deleteProduct("p-1")).rejects.toBeInstanceOf(PermissionError);
  });

  it("cascades deletion: product_variants, product_images, then products", async () => {
    asAdmin({ products: ["delete"] });
    const admin = getAdminClient();
    admin.enqueueResponse({ data: null, error: null });
    admin.enqueueResponse({ data: null, error: null });
    admin.enqueueResponse({ data: null, error: null });

    await deleteProduct("p-1");

    const tablesTouched = admin.calls
      .filter((c) => c.method === "from")
      .map((c) => c.args[0]);
    expect(tablesTouched).toEqual(["product_variants", "product_images", "products"]);
  });

  it("revalidates /products", async () => {
    asAdmin({ products: ["delete"] });
    const admin = getAdminClient();
    admin.enqueueResponse({ data: null, error: null });
    admin.enqueueResponse({ data: null, error: null });
    admin.enqueueResponse({ data: null, error: null });

    await deleteProduct("p-1");
    expect(revalidatePathMock).toHaveBeenCalledWith("/products");
  });

  it("throws when the final delete fails", async () => {
    asAdmin({ products: ["delete"] });
    const admin = getAdminClient();
    admin.enqueueResponse({ data: null, error: null });
    admin.enqueueResponse({ data: null, error: null });
    admin.enqueueResponse({ data: null, error: { message: "delete failed" } });

    await expect(deleteProduct("p-1")).rejects.toThrow("delete failed");
  });
});

describe("bulkImportProducts", () => {
  it("rejects users without products:create permission", async () => {
    asAdmin({ products: ["view"] });
    await expect(bulkImportProducts([{ name: "Test" }])).rejects.toBeInstanceOf(PermissionError);
  });

  it("imports all valid rows and reports zero errors", async () => {
    asAdmin({ products: ["create"] });
    const admin = getAdminClient();
    admin.enqueueResponse({
      data: [makeCategory({ id: "c-1", name: "Snacks" })],
      error: null,
    });
    admin.enqueueResponse({ data: { id: "store-1" }, error: null });
    admin.enqueueResponse({ data: null, error: null });
    admin.enqueueResponse({ data: null, error: null });

    const result = await bulkImportProducts([
      { name: "Chips", category_name: "Snacks", mrp: "20", selling_price: "18" },
      { name: "Cookies", category_name: "Snacks", mrp: "30", selling_price: "25" },
    ]);
    expect(result.imported).toBe(2);
    expect(result.errors).toEqual([]);
  });

  it("reports an error for rows missing the name", async () => {
    asAdmin({ products: ["create"] });
    const admin = getAdminClient();
    admin.enqueueResponse({ data: [], error: null });
    admin.enqueueResponse({ data: { id: "store-1" }, error: null });

    const result = await bulkImportProducts([
      { name: "", category_name: "Snacks", mrp: "20", selling_price: "18" },
    ]);
    expect(result.imported).toBe(0);
    expect(result.errors).toEqual([
      { row: 2, field: "name", message: "Product name is required" },
    ]);
  });

  it("uses null category when category_name is not found", async () => {
    asAdmin({ products: ["create"] });
    const admin = getAdminClient();
    admin.enqueueResponse({ data: [makeCategory({ id: "c-1", name: "Snacks" })], error: null });
    admin.enqueueResponse({ data: { id: "store-1" }, error: null });
    admin.enqueueResponse({ data: null, error: null });

    const result = await bulkImportProducts([
      { name: "Chips", category_name: "Unknown", mrp: "20", selling_price: "18" },
    ]);
    expect(result.imported).toBe(1);
    const insertArg = admin.chainsForTable("products")[0]
      .find((c) => c.method === "insert")!.args[0] as Record<string, unknown>;
    expect(insertArg.category_id).toBeNull();
  });

  it("reports db errors and continues with the rest", async () => {
    asAdmin({ products: ["create"] });
    const admin = getAdminClient();
    admin.enqueueResponse({ data: [], error: null });
    admin.enqueueResponse({ data: { id: "store-1" }, error: null });
    admin.enqueueResponse({ data: null, error: { message: "db error" } });
    admin.enqueueResponse({ data: null, error: null });

    const result = await bulkImportProducts([
      { name: "A", mrp: "10", selling_price: "8" },
      { name: "B", mrp: "20", selling_price: "18" },
    ]);
    expect(result.imported).toBe(1);
    expect(result.errors).toEqual([
      { row: 2, field: "db", message: "db error" },
    ]);
  });

  it("applies default values for missing optional fields", async () => {
    asAdmin({ products: ["create"] });
    const admin = getAdminClient();
    admin.enqueueResponse({ data: [], error: null });
    admin.enqueueResponse({ data: { id: "store-1" }, error: null });
    admin.enqueueResponse({ data: null, error: null });

    const result = await bulkImportProducts([
      { name: "Bare Minimum" },
    ]);
    expect(result.imported).toBe(1);
    const insertArg = admin.chainsForTable("products")[0]
      .find((c) => c.method === "insert")!.args[0] as Record<string, unknown>;
    expect(insertArg.mrp).toBe(0);
    expect(insertArg.selling_price).toBe(0);
    expect(insertArg.unit_of_measurement).toBe("piece");
    expect(insertArg.status).toBe("active");
    expect(insertArg.sku).toBeNull();
  });

  it("lowercases the category name for the lookup", async () => {
    asAdmin({ products: ["create"] });
    const admin = getAdminClient();
    admin.enqueueResponse({
      data: [makeCategory({ id: "c-1", name: "Snacks" })],
      error: null,
    });
    admin.enqueueResponse({ data: { id: "store-1" }, error: null });
    admin.enqueueResponse({ data: null, error: null });

    const result = await bulkImportProducts([
      { name: "Chips", category_name: "SNACKS", mrp: "20", selling_price: "18" },
    ]);
    expect(result.imported).toBe(1);
  });

  it("revalidates /products after the import", async () => {
    asAdmin({ products: ["create"] });
    const admin = getAdminClient();
    admin.enqueueResponse({ data: [], error: null });
    admin.enqueueResponse({ data: { id: "store-1" }, error: null });
    admin.enqueueResponse({ data: null, error: null });

    await bulkImportProducts([{ name: "Chips", mrp: "20", selling_price: "18" }]);
    expect(revalidatePathMock).toHaveBeenCalledWith("/products");
  });
});
