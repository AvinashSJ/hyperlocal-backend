import { describe, it, expect, beforeEach, vi } from "vitest";
import "../../../../../../test/mocks/supabase-clients";
import "../../../../../../test/mocks/next-cache";
import "../../../../../../test/mocks/next-navigation";
import "../../../../../../test/mocks/require-permission";
import {
  getAdminClient,
  resetSupabaseClients,
} from "../../../../../../test/mocks/supabase-clients";
import {
  asSuperAdmin,
  asAdmin,
  asAnonymous,
  resetPermissionMock,
  PermissionError,
} from "../../../../../../test/mocks/require-permission";
import { makeProduct, makeCategory } from "../../../../../../test/fixtures/factories";

const { getStoreScopeMock } = vi.hoisted(() => ({
  getStoreScopeMock: vi.fn(),
}));

vi.mock("@/lib/store-scope", () => ({
  getStoreScope: getStoreScopeMock,
}));

import { GET, PermissionError as ExportedPermissionError } from "./route";

beforeEach(() => {
  resetSupabaseClients();
  resetPermissionMock();
  getStoreScopeMock.mockReset();
  // Default: super admin (no store scope, no filter)
  getStoreScopeMock.mockResolvedValue({ storeId: null, isStoreScoped: false });
});

describe("GET /api/admin/products/export", () => {
  it("returns 200 with CSV for a super admin (no store filter)", async () => {
    asSuperAdmin();
    const admin = getAdminClient();
    admin.enqueueResponse({
      data: [
        makeProduct({
          name: "Whole Wheat Bread",
          description: "Fresh loaf",
          mrp: 45,
          selling_price: 35,
          discount_percent: 22.22,
          stock_quantity: 20,
        }),
      ],
      error: null,
    });

    const res = await GET();
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain("name,category_name,brand"); // header
    expect(text).toContain("Whole Wheat Bread");
  });

  it("does NOT filter by store_id for a super admin", async () => {
    asSuperAdmin();
    const admin = getAdminClient();
    admin.enqueueResponse({ data: [], error: null });

    await GET();
    const productChain = admin.chainsForTable("products")[0];
    const eqCalls = productChain.filter((c) => c.method === "eq");
    expect(eqCalls).toHaveLength(0);
  });

  it("filters by store_id for a store-scoped user", async () => {
    asAdmin({ products: ["view"] });
    getStoreScopeMock.mockResolvedValue({ storeId: "store-user", isStoreScoped: true });
    const admin = getAdminClient();
    admin.enqueueResponse({ data: [], error: null });

    await GET();
    const productChain = admin.chainsForTable("products")[0];
    const storeIdEq = productChain.find(
      (c) => c.method === "eq" && c.args[0] === "store_id",
    );
    expect(storeIdEq?.args).toEqual(["store_id", "store-user"]);
  });

  it("throws PermissionError for anonymous users", async () => {
    asAnonymous();
    await expect(GET()).rejects.toBeInstanceOf(PermissionError);
  });

  it("throws PermissionError for users without products:view", async () => {
    asAdmin({ products: ["create"] });
    await expect(GET()).rejects.toBeInstanceOf(PermissionError);
  });

  it("escapes values containing commas, quotes, and newlines (RFC 4180)", async () => {
    asSuperAdmin();
    const admin = getAdminClient();
    admin.enqueueResponse({
      data: [
        makeProduct({
          name: `Big "Apple", Red`,
          description: "Line1\nLine2",
        }),
      ],
      error: null,
    });

    const res = await GET();
    const text = await res.text();
    // RFC 4180: double internal quotes, wrap in outer quotes when value contains a quote
    expect(text).toContain(`"Big ""Apple"", Red"`);
    // Newlines inside a quoted field are valid CSV
    expect(text).toContain(`"Line1\nLine2"`);
  });

  it("includes the import-compatible header row (round-trip with bulk import)", async () => {
    asSuperAdmin();
    const admin = getAdminClient();
    admin.enqueueResponse({ data: [], error: null });

    const res = await GET();
    const text = await res.text();
    const header = text.split("\n")[0];
    expect(header).toBe(
      "name,category_name,brand,description,unit_of_measurement,mrp,selling_price,discount_percent,gst_rate,hsn_code,stock_quantity,low_stock_threshold,status,sku",
    );
  });

  it("resolves category_name from the joined categories(name) column", async () => {
    asSuperAdmin();
    const admin = getAdminClient();
    admin.enqueueResponse({
      data: [
        {
          ...makeProduct({ name: "Chips" }),
          categories: { name: "Snacks" },
        },
      ],
      error: null,
    });

    const res = await GET();
    const text = await res.text();
    // header + row; the category_name field is the 2nd column
    const dataRow = text.split("\n")[1];
    expect(dataRow).toContain("Snacks");
  });

  it("emits an empty category_name when the product has no category", async () => {
    asSuperAdmin();
    const admin = getAdminClient();
    admin.enqueueResponse({
      data: [makeProduct({ name: "Orphan Product" })],
      error: null,
    });

    const res = await GET();
    const text = await res.text();
    const dataRow = text.split("\n")[1];
    // name is column 0, category_name is column 1 (empty)
    const cols = dataRow.split(",");
    expect(cols[0]).toBe("Orphan Product");
    expect(cols[1]).toBe("");
  });

  it("applies a safety limit (MAX_EXPORT_ROWS) on the products query", async () => {
    asSuperAdmin();
    const admin = getAdminClient();
    admin.enqueueResponse({ data: [], error: null });

    await GET();
    const productChain = admin.chainsForTable("products")[0];
    const limitCall = productChain.find((c) => c.method === "limit");
    expect(limitCall?.args[0]).toBe(10_000);
  });

  it("sets Content-Disposition with a date-stamped filename", async () => {
    asSuperAdmin();
    const admin = getAdminClient();
    admin.enqueueResponse({ data: [], error: null });

    const res = await GET();
    const disposition = res.headers.get("Content-Disposition");
    expect(disposition).toMatch(
      /^attachment; filename="products-\d{4}-\d{2}-\d{2}\.csv"$/,
    );
  });

  it("sets the Content-Type to text/csv with utf-8 charset", async () => {
    asSuperAdmin();
    const admin = getAdminClient();
    admin.enqueueResponse({ data: [], error: null });

    const res = await GET();
    expect(res.headers.get("Content-Type")).toBe("text/csv; charset=utf-8");
  });

  it("returns 500 with error message when the Supabase query fails", async () => {
    asSuperAdmin();
    const admin = getAdminClient();
    admin.enqueueResponse({ data: null, error: { message: "db down" } });

    const res = await GET();
    expect(res.status).toBe(500);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("db down");
  });

  it("re-exports PermissionError so callers can narrow the rejection", () => {
    expect(ExportedPermissionError).toBe(PermissionError);
  });

  it("includes a category from the joined query in the export", async () => {
    // Sanity check that the route's response includes the joined category data
    asSuperAdmin();
    const admin = getAdminClient();
    admin.enqueueResponse({
      data: [
        {
          ...makeProduct({ name: "X" }),
          categories: { name: "TestCat" },
        },
      ],
      error: null,
    });

    const res = await GET();
    const text = await res.text();
    // ensure no Unused-Locals (categories joined)
    expect(makeCategory).toBeDefined();
    expect(text).toContain("TestCat");
  });
});
