import { describe, it, expect, beforeEach, vi } from "vitest";
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
  asAnonymous,
  asSuperAdmin,
  resetPermissionMock,
  assertPermissionMock,
  PermissionError,
} from "../../../../test/mocks/require-permission";
import { makeOrder, makeOrderItem, makeInvoice } from "../../../../test/fixtures/factories";

import { getInvoices, getInvoice, generateInvoice } from "./actions";

beforeEach(() => {
  resetSupabaseClients();
  resetPermissionMock();
  revalidatePathMock.mockClear();
  assertPermissionMock.mockClear();
});

describe("getInvoices", () => {
  it("returns the full list when no storeId is provided", async () => {
    asSuperAdmin();
    const admin = getAdminClient();
    admin.enqueueResponse({ data: [makeInvoice(), makeInvoice({ id: "i-2" })], error: null });

    const result = await getInvoices();
    expect(result).toHaveLength(2);
  });

  it("filters by orders.store_id when storeId is provided", async () => {
    asSuperAdmin();
    const admin = getAdminClient();
    admin.enqueueResponse({
      data: [makeInvoice({ id: "i-1" })],
      error: null,
    });

    const result = await getInvoices("s-1");
    expect(result).toHaveLength(1);
  });

  it("returns empty array when data is null", async () => {
    asSuperAdmin();
    const admin = getAdminClient();
    admin.enqueueResponse({ data: null, error: null });

    const result = await getInvoices();
    expect(result).toEqual([]);
  });

  it("throws when supabase returns an error", async () => {
    asSuperAdmin();
    const admin = getAdminClient();
    admin.enqueueResponse({ data: null, error: { message: "db boom" } });

    await expect(getInvoices()).rejects.toThrow("db boom");
  });

  // P43: each invoice in the list exposes its store (name + code)
  // joined through orders. Legacy invoices (no order store_id) get null.
  it("P43: includes the store name and code for each invoice", async () => {
    asSuperAdmin();
    const admin = getAdminClient();
    const inv = makeInvoice({ id: "i-1" });
    // P43: the joined `orders.stores` is enriched from a JOIN that
    // makeInvoice doesn't pre-populate. Cast through unknown (AGENTS.md
    // pattern) since makeInvoice is a generic factory.
    (inv as unknown as { orders: { store_id: string | null; stores: { name: string; code: string } | null } }).orders = {
      store_id: "s-1",
      stores: { name: "FreshCart", code: "A1B2C3D4" },
    };
    const inv2 = makeInvoice({ id: "i-2" });
    (inv2 as unknown as { orders: { store_id: string | null; stores: { name: string; code: string } | null } }).orders = {
      store_id: null,
      stores: null,
    };
    admin.enqueueResponse({ data: [inv, inv2], error: null });

    const result = await getInvoices();
    expect(result).toHaveLength(2);
    expect(result[0].orders?.stores).toEqual({ name: "FreshCart", code: "A1B2C3D4" });
    expect(result[1].orders?.stores).toBeNull();
  });
});

describe("getInvoice", () => {
  it("returns a single invoice with relations", async () => {
    asSuperAdmin();
    const invoice = makeInvoice({ id: "i-1" });
    const admin = getAdminClient();
    admin.enqueueResponse({ data: invoice, error: null });
    // P39: getInvoice now also fetches the store and primary GSTIN.
    admin.enqueueResponse({ data: null, error: null });
    admin.enqueueResponse({ data: null, error: null });

    const result = await getInvoice("i-1");
    expect(result.id).toBe("i-1");
  });

  it("throws when the invoice is not found", async () => {
    asSuperAdmin();
    const admin = getAdminClient();
    admin.enqueueResponse({
      data: null,
      error: { message: "Not found", code: "PGRST116" },
    });

    await expect(getInvoice("missing")).rejects.toThrow("Not found");
  });

  // P39: permission check
  it("rejects callers without invoices:view permission", async () => {
    asAdmin({});
    await expect(getInvoice("i-1")).rejects.toBeInstanceOf(PermissionError);
  });

  it("rejects anonymous callers (no role at all)", async () => {
    asAnonymous();
    await expect(getInvoice("i-1")).rejects.toBeInstanceOf(PermissionError);
  });

  // P39: store enrichment
  it("enriches the invoice with the order's store name, address, and primary GSTIN", async () => {
    asSuperAdmin();
    const admin = getAdminClient();
    const invoice = makeInvoice({
      id: "i-1",
    });
    // Patch the orders relation so it has a store_id
    (invoice as { orders?: { store_id: string | null } }).orders = { store_id: "s-1" };
    admin.enqueueResponse({ data: invoice, error: null });
    // store fetch
    admin.enqueueResponse({
      data: {
        name: "Test Store",
        address: "123 Main St",
        city: "Bangalore",
        state: "KA",
        pincode: "560001",
        phone: "+911234567890",
        email: "store@example.com",
      },
      error: null,
    });
    // primary GSTIN fetch
    admin.enqueueResponse({
      data: { gstin: "29ABCDE1234F1Z5", legal_name: "Test Store Pvt Ltd" },
      error: null,
    });

    const result = await getInvoice("i-1");
    expect(result.store).toEqual({
      name: "Test Store",
      address: "123 Main St",
      city: "Bangalore",
      state: "KA",
      pincode: "560001",
      phone: "+911234567890",
      email: "store@example.com",
      gstin: "29ABCDE1234F1Z5",
      legal_name: "Test Store Pvt Ltd",
    });
  });

  it("returns store: null when the order has no store_id (legacy data)", async () => {
    asSuperAdmin();
    const admin = getAdminClient();
    const invoice = makeInvoice({ id: "i-1" });
    (invoice as { orders?: { store_id: string | null } }).orders = { store_id: null };
    admin.enqueueResponse({ data: invoice, error: null });

    const result = await getInvoice("i-1");
    expect(result.store).toBeNull();
  });

  it("returns store with gstin: null when the store has no primary GSTIN", async () => {
    asSuperAdmin();
    const admin = getAdminClient();
    const invoice = makeInvoice({ id: "i-1" });
    (invoice as { orders?: { store_id: string | null } }).orders = { store_id: "s-1" };
    admin.enqueueResponse({ data: invoice, error: null });
    admin.enqueueResponse({
      data: {
        name: "Test Store",
        address: "123 Main St",
        city: "Bangalore",
        state: "KA",
        pincode: "560001",
        phone: null,
        email: null,
      },
      error: null,
    });
    admin.enqueueResponse({ data: null, error: null }); // no GSTIN row

    const result = await getInvoice("i-1");
    expect(result.store?.name).toBe("Test Store");
    expect(result.store?.gstin).toBeNull();
  });
});

describe("generateInvoice", () => {
  function makeOrderWithItems(totalAmount: number, deliveryCharge: number, items: { gst_amount: number }[]) {
    return {
      ...makeOrder({ id: "o-1", total_amount: totalAmount, delivery_charge: deliveryCharge }),
      order_items: items.map((i) => ({ ...makeOrderItem(), gst_amount: i.gst_amount })),
    };
  }

  it("rejects users without invoices:create permission", async () => {
    asAdmin({ invoices: ["view"] });
    await expect(generateInvoice("o-1")).rejects.toBeInstanceOf(PermissionError);
  });

  it("P43: uses INV-ORPHAN-{year}-{seq} when the order has no store_id (legacy data)", async () => {
    asAdmin({ invoices: ["create"] });
    const admin = getAdminClient();
    // Order with no store_id (legacy / orphaned).
    admin.enqueueResponse({
      data: makeOrderWithItems(1180, 100, [{ gst_amount: 180 }]),
      error: null,
    });
    // Count of existing ORPHAN invoices for this year. P43: count is
    // a top-level response property.
    admin.enqueueResponse({ count: 0, data: null, error: null });
    admin.enqueueResponse({ data: { id: "new-invoice-1" }, error: null });
    admin.enqueueResponse({ data: null, error: null });

    await generateInvoice("o-1");

    const insertArg = admin.chainsForTable("invoices").slice(-1)[0]
      .find((c) => c.method === "insert")!.args[0] as Record<string, unknown>;
    const year = new Date().getFullYear();
    expect(insertArg.invoice_number).toBe(`INV-ORPHAN-${year}-0001`);
  });

  it("P43: uses INV-{storeCode}-{year}-{seq} when the order has a store (per-store numbering)", async () => {
    asAdmin({ invoices: ["create"] });
    const admin = getAdminClient();
    // Order with a store_id; the join returns the store's code.
    admin.enqueueResponse({
      data: {
        ...makeOrder({ id: "o-1", total_amount: 1180, delivery_charge: 100, store_id: "s-1" }),
        order_items: [{ ...makeOrderItem(), gst_amount: 180 }],
        stores: { code: "A1B2C3D4" },
      },
      error: null,
    });
    // Count of existing per-store invoices (INV-A1B2C3D4-{year}-%).
    // P43: count is a top-level response property (matches the real
    // Supabase client), NOT nested inside `data`.
    admin.enqueueResponse({ count: 5, data: null, error: null });
    admin.enqueueResponse({ data: { id: "new-invoice-1" }, error: null });
    admin.enqueueResponse({ data: null, error: null });

    await generateInvoice("o-1");

    const insertArg = admin.chainsForTable("invoices").slice(-1)[0]
      .find((c) => c.method === "insert")!.args[0] as Record<string, unknown>;
    const year = new Date().getFullYear();
    expect(insertArg.invoice_number).toBe(`INV-A1B2C3D4-${year}-0006`);

    // Verify the per-store count query was issued with the right
    // invoice_number LIKE pattern.
    const invoiceChains = admin.chainsForTable("invoices");
    const countChain = invoiceChains.find((ch) =>
      ch.some((c) => c.method === "like"),
    );
    expect(countChain).toBeDefined();
    const likeCall = countChain!.find((c) => c.method === "like")!;
    expect(likeCall.args[0]).toBe("invoice_number");
    expect(likeCall.args[1]).toBe(`INV-A1B2C3D4-${year}-%`);
  });

  it("P43: per-store numbering is independent — two stores both start at 0001", async () => {
    asAdmin({ invoices: ["create"] });
    const admin = getAdminClient();
    // First store
    admin.enqueueResponse({
      data: {
        ...makeOrder({ id: "o-1", total_amount: 100, store_id: "s-1" }),
        order_items: [{ ...makeOrderItem(), gst_amount: 0 }],
        stores: { code: "STORE_A" },
      },
      error: null,
    });
    // P43: count is a top-level response property.
    admin.enqueueResponse({ count: 0, data: null, error: null });
    admin.enqueueResponse({ data: { id: "i-1" }, error: null });
    admin.enqueueResponse({ data: null, error: null });

    await generateInvoice("o-1");
    let insertArg = admin.chainsForTable("invoices").slice(-1)[0]
      .find((c) => c.method === "insert")!.args[0] as Record<string, unknown>;
    expect(insertArg.invoice_number).toBe(`INV-STORE_A-${new Date().getFullYear()}-0001`);

    // Second store — independent counter
    admin.enqueueResponse({
      data: {
        ...makeOrder({ id: "o-2", total_amount: 200, store_id: "s-2" }),
        order_items: [{ ...makeOrderItem(), gst_amount: 0 }],
        stores: { code: "STORE_B" },
      },
      error: null,
    });
    admin.enqueueResponse({ count: 0, data: null, error: null });
    admin.enqueueResponse({ data: { id: "i-2" }, error: null });
    admin.enqueueResponse({ data: null, error: null });

    await generateInvoice("o-2");
    insertArg = admin.chainsForTable("invoices").slice(-1)[0]
      .find((c) => c.method === "insert")!.args[0] as Record<string, unknown>;
    expect(insertArg.invoice_number).toBe(`INV-STORE_B-${new Date().getFullYear()}-0001`);
  });

  it("computes taxable_amount as total - delivery_charge", async () => {
    asAdmin({ invoices: ["create"] });
    const admin = getAdminClient();
    admin.enqueueResponse({
      data: makeOrderWithItems(1180, 100, [{ gst_amount: 180 }]),
      error: null,
    });
    admin.enqueueResponse({ data: { count: 5, error: null }, error: null });
    admin.enqueueResponse({ data: { id: "new-invoice" }, error: null });
    admin.enqueueResponse({ data: null, error: null });

    await generateInvoice("o-1");

    const insertArg = admin.chainsForTable("invoices").slice(-1)[0]
      .find((c) => c.method === "insert")!.args[0] as Record<string, unknown>;
    expect(insertArg.taxable_amount).toBe(1080);
  });

  it("splits GST total equally into CGST and SGST", async () => {
    asAdmin({ invoices: ["create"] });
    const admin = getAdminClient();
    admin.enqueueResponse({
      data: makeOrderWithItems(1180, 0, [
        { gst_amount: 60 },
        { gst_amount: 60 },
        { gst_amount: 60 },
      ]),
      error: null,
    });
    admin.enqueueResponse({ data: { count: 0 }, error: null });
    admin.enqueueResponse({ data: { id: "i-new" }, error: null });
    admin.enqueueResponse({ data: null, error: null });

    await generateInvoice("o-1");

    const insertArg = admin.chainsForTable("invoices").slice(-1)[0]
      .find((c) => c.method === "insert")!.args[0] as Record<string, unknown>;
    expect(insertArg.cgst).toBe(90);
    expect(insertArg.sgst).toBe(90);
  });

  it("uses total_amount as the invoice total", async () => {
    asAdmin({ invoices: ["create"] });
    const admin = getAdminClient();
    admin.enqueueResponse({
      data: makeOrderWithItems(1234.56, 50, [{ gst_amount: 100 }]),
      error: null,
    });
    admin.enqueueResponse({ data: { count: 0 }, error: null });
    admin.enqueueResponse({ data: { id: "i" }, error: null });
    admin.enqueueResponse({ data: null, error: null });

    await generateInvoice("o-1");

    const insertArg = admin.chainsForTable("invoices").slice(-1)[0]
      .find((c) => c.method === "insert")!.args[0] as Record<string, unknown>;
    expect(insertArg.total_amount).toBe(1234.56);
  });

  it("sets status to 'generated' and links to the order", async () => {
    asAdmin({ invoices: ["create"] });
    const admin = getAdminClient();
    admin.enqueueResponse({
      data: makeOrderWithItems(100, 0, [{ gst_amount: 0 }]),
      error: null,
    });
    admin.enqueueResponse({ data: { count: 0 }, error: null });
    admin.enqueueResponse({ data: { id: "new-id" }, error: null });
    admin.enqueueResponse({ data: null, error: null });

    await generateInvoice("o-1");

    const insertArg = admin.chainsForTable("invoices").slice(-1)[0]
      .find((c) => c.method === "insert")!.args[0] as Record<string, unknown>;
    expect(insertArg.order_id).toBe("o-1");
    expect(insertArg.status).toBe("generated");
  });

  it("sets the orders.invoice_id after creating the invoice", async () => {
    asAdmin({ invoices: ["create"] });
    const admin = getAdminClient();
    admin.enqueueResponse({
      data: makeOrderWithItems(100, 0, [{ gst_amount: 0 }]),
      error: null,
    });
    admin.enqueueResponse({ data: { count: 0 }, error: null });
    admin.enqueueResponse({ data: { id: "new-invoice-id" }, error: null });
    admin.enqueueResponse({ data: null, error: null });

    await generateInvoice("o-1");

    const orderUpdates = admin.chainsForTable("orders").slice(-1)[0]
      .filter((c) => c.method === "update");
    expect(orderUpdates).toHaveLength(1);
    const updateArg = orderUpdates[0].args[0] as Record<string, unknown>;
    expect(updateArg.invoice_id).toBe("new-invoice-id");
  });

  it("revalidates /invoices and /orders/<orderId>", async () => {
    asAdmin({ invoices: ["create"] });
    const admin = getAdminClient();
    admin.enqueueResponse({
      data: makeOrderWithItems(100, 0, [{ gst_amount: 0 }]),
      error: null,
    });
    admin.enqueueResponse({ data: { count: 0 }, error: null });
    admin.enqueueResponse({ data: { id: "i" }, error: null });
    admin.enqueueResponse({ data: null, error: null });

    await generateInvoice("o-1");

    expect(revalidatePathMock).toHaveBeenCalledWith("/invoices");
    expect(revalidatePathMock).toHaveBeenCalledWith("/orders/o-1");
  });

  it("returns the new invoice id", async () => {
    asAdmin({ invoices: ["create"] });
    const admin = getAdminClient();
    admin.enqueueResponse({
      data: makeOrderWithItems(100, 0, [{ gst_amount: 0 }]),
      error: null,
    });
    admin.enqueueResponse({ data: { count: 0 }, error: null });
    admin.enqueueResponse({ data: { id: "the-new-id" }, error: null });
    admin.enqueueResponse({ data: null, error: null });

    const result = await generateInvoice("o-1");
    expect(result).toBe("the-new-id");
  });

  it("throws when the order fetch fails", async () => {
    asAdmin({ invoices: ["create"] });
    const admin = getAdminClient();
    admin.enqueueResponse({ data: null, error: { message: "order fetch failed" } });

    await expect(generateInvoice("o-1")).rejects.toThrow("order fetch failed");
  });

  it("throws when the invoice insert fails", async () => {
    asAdmin({ invoices: ["create"] });
    const admin = getAdminClient();
    admin.enqueueResponse({
      data: makeOrderWithItems(100, 0, [{ gst_amount: 0 }]),
      error: null,
    });
    admin.enqueueResponse({ count: 0, data: null, error: null });
    admin.enqueueResponse({ data: null, error: { message: "insert failed" } });

    await expect(generateInvoice("o-1")).rejects.toThrow("insert failed");
  });

  // -----------------------------------------------------------------
  // P58: UNIQUE invoice_number race retry
  // -----------------------------------------------------------------
  // The per-store invoice_number is computed via a read-then-write
  // (count + insert). Two concurrent generateInvoice calls for
  // the same store+year can both read the same count, compute the
  // same invNum, and one of them loses the UNIQUE constraint. The
  // fix is a retry loop on the count+insert.
  // -----------------------------------------------------------------

  function makeOrderWithStore(totalAmount: number, storeCode: string | null) {
    return {
      ...makeOrderWithItems(totalAmount, 0, [{ gst_amount: 0 }]),
      stores: storeCode ? { code: storeCode } : null,
    };
  }

  it("P58: retries on UNIQUE violation (PG 23505) on invoice_number and succeeds on next attempt", async () => {
    asAdmin({ invoices: ["create"] });
    const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const admin = getAdminClient();
    // 1) order fetch
    admin.enqueueResponse({ data: makeOrderWithStore(100, "FCD"), error: null });
    // 2) attempt 1: count = 0
    admin.enqueueResponse({ count: 0, data: null, error: null });
    // 3) attempt 1: insert — fails with UNIQUE violation (Postgres 23505)
    admin.enqueueResponse({
      data: null,
      error: {
        message: 'duplicate key value violates unique constraint "invoices_invoice_number_key"',
        code: "23505",
      },
    });
    // 4) attempt 2: count = 1 (the racing call's row is now committed)
    admin.enqueueResponse({ count: 1, data: null, error: null });
    // 5) attempt 2: insert — succeeds
    admin.enqueueResponse({ data: { id: "i-99" }, error: null });
    // 6) update order to set invoice_id
    admin.enqueueResponse({ data: null, error: null });

    const result = await generateInvoice("o-1");
    expect(result).toBe("i-99");
    expect(consoleSpy).toHaveBeenCalled();
    const warningMsg = consoleSpy.mock.calls[0][0] as string;
    expect(warningMsg).toMatch(/invoice_number race/);
    expect(warningMsg).toMatch(/attempt 1\/5/);
    consoleSpy.mockRestore();
  });

  it("P58: detects UNIQUE violation via message string (older PostgREST without code field)", async () => {
    asAdmin({ invoices: ["create"] });
    const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const admin = getAdminClient();
    // 1) order fetch
    admin.enqueueResponse({ data: makeOrderWithStore(100, "FCD"), error: null });
    // 2) attempt 1: count = 0
    admin.enqueueResponse({ count: 0, data: null, error: null });
    // 3) attempt 1: insert — fails with UNIQUE violation in the
    //    message (no `code` field, simulating older PostgREST).
    admin.enqueueResponse({
      data: null,
      error: { message: 'duplicate key value violates unique constraint "invoices_invoice_number_key"' },
    });
    // 4) attempt 2: count = 1
    admin.enqueueResponse({ count: 1, data: null, error: null });
    // 5) attempt 2: insert — succeeds
    admin.enqueueResponse({ data: { id: "i-100" }, error: null });
    // 6) update order
    admin.enqueueResponse({ data: null, error: null });

    const result = await generateInvoice("o-1");
    expect(result).toBe("i-100");
    consoleSpy.mockRestore();
  });

  it("P58: surfaces non-UNIQUE errors immediately without retrying", async () => {
    asAdmin({ invoices: ["create"] });
    const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const admin = getAdminClient();
    // 1) order fetch
    admin.enqueueResponse({ data: makeOrderWithStore(100, "FCD"), error: null });
    // 2) attempt 1: count = 0
    admin.enqueueResponse({ count: 0, data: null, error: null });
    // 3) attempt 1: insert — fails with a non-UNIQUE error
    admin.enqueueResponse({
      data: null,
      error: { message: "FK violation: orders.id does not exist" },
    });
    // No attempt 2 should be queued.

    await expect(generateInvoice("o-1")).rejects.toThrow("FK violation");
    expect(consoleSpy).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it("P58: gives up after MAX_INVOICE_NUMBER_ATTEMPTS races in a row and throws", async () => {
    asAdmin({ invoices: ["create"] });
    const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const admin = getAdminClient();
    // 1) order fetch
    admin.enqueueResponse({ data: makeOrderWithStore(100, "FCD"), error: null });
    // 2-11) 5 attempts × (count + UNIQUE-violation insert) = 10 responses
    for (let i = 0; i < 5; i++) {
      admin.enqueueResponse({ count: i, data: null, error: null });
      admin.enqueueResponse({
        data: null,
        error: { message: 'duplicate key value violates unique constraint "invoices_invoice_number_key"', code: "23505" },
      });
    }

    await expect(generateInvoice("o-1")).rejects.toThrow(
      /Failed to generate invoice after 5 attempts/,
    );
    expect(consoleSpy).toHaveBeenCalledTimes(5);
    consoleSpy.mockRestore();
  });

  it("P58: succeeds on attempt 3 after two UNIQUE violations (the third count sees both racing rows)", async () => {
    asAdmin({ invoices: ["create"] });
    const admin = getAdminClient();
    // 1) order fetch
    admin.enqueueResponse({ data: makeOrderWithStore(100, "FCD"), error: null });
    // attempt 1: count=0, UNIQUE violation
    admin.enqueueResponse({ count: 0, data: null, error: null });
    admin.enqueueResponse({
      data: null,
      error: { code: "23505", message: 'duplicate key value violates unique constraint "invoices_invoice_number_key"' },
    });
    // attempt 2: count=1, UNIQUE violation (another concurrent call)
    admin.enqueueResponse({ count: 1, data: null, error: null });
    admin.enqueueResponse({
      data: null,
      error: { code: "23505", message: 'duplicate key value violates unique constraint "invoices_invoice_number_key"' },
    });
    // attempt 3: count=2, success
    admin.enqueueResponse({ count: 2, data: null, error: null });
    admin.enqueueResponse({ data: { id: "i-3rd" }, error: null });
    admin.enqueueResponse({ data: null, error: null }); // update order

    const result = await generateInvoice("o-1");
    expect(result).toBe("i-3rd");
  });
});
