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

  it("computes invoice number in INV-YYYY-NNNN format", async () => {
    asAdmin({ invoices: ["create"] });
    const admin = getAdminClient();
    admin.enqueueResponse({
      data: makeOrderWithItems(1180, 100, [{ gst_amount: 180 }]),
      error: null,
    });
    admin.enqueueResponse({ data: { count: 0, error: null }, error: null });
    admin.enqueueResponse({ data: { id: "new-invoice-1" }, error: null });
    admin.enqueueResponse({ data: null, error: null });

    await generateInvoice("o-1");

    const insertArg = admin.chainsForTable("invoices").slice(-1)[0]
      .find((c) => c.method === "insert")!.args[0] as Record<string, unknown>;
    const year = new Date().getFullYear();
    expect(insertArg.invoice_number).toBe(`INV-${year}-0001`);
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
    admin.enqueueResponse({ data: { count: 0 }, error: null });
    admin.enqueueResponse({ data: null, error: { message: "insert failed" } });

    await expect(generateInvoice("o-1")).rejects.toThrow("insert failed");
  });
});
