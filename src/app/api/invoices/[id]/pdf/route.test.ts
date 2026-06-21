import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import "../../../../../../test/mocks/supabase-clients";
import "../../../../../../test/mocks/next-cache";
import "../../../../../../test/mocks/next-navigation";
import {
  asAdmin,
  asSuperAdmin,
  asAnonymous,
  resetPermissionMock,
  PermissionError,
} from "../../../../../../test/mocks/require-permission";
import {
  getAdminClient,
  resetSupabaseClients,
} from "../../../../../../test/mocks/supabase-clients";
import { makeInvoice, makeStore, makeGstNumber } from "../../../../../../test/fixtures/factories";

// Mock @react-pdf/renderer so we don't actually render a PDF in
// tests. The route calls renderToBuffer(element); we substitute a
// tiny PDF header (%PDF-1.4) so the route's content assertions
// (status, content-type, content-disposition, buffer length) can
// pass deterministically.
vi.mock("@react-pdf/renderer", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    renderToBuffer: vi.fn(async () => Buffer.from("%PDF-1.4 fake buffer for tests")),
  };
});

// Mock getStoreScope to control the caller's storeId per test.
let nextStoreScope: { storeId: string | null; isStoreScoped: boolean } = {
  storeId: null,
  isStoreScoped: false,
};
vi.mock("@/lib/store-scope", () => ({
  getStoreScope: vi.fn(async () => nextStoreScope),
}));

import { GET } from "./route";

beforeEach(() => {
  resetSupabaseClients();
  resetPermissionMock();
  nextStoreScope = { storeId: null, isStoreScoped: false };
  vi.clearAllMocks();
});

function makeInvoiceWithOrderStore(overrides: Partial<{ storeId: string | null }> = {}) {
  const invoice = makeInvoice({ id: "i-1" });
  // The order is embedded under the `orders` foreign key.
  (invoice as { orders?: { store_id: string | null } }).orders = {
    store_id: overrides.storeId ?? "s-1",
  };
  return invoice;
}

async function callRoute(id = "i-1"): Promise<Response> {
  const request = new NextRequest(new URL(`/api/invoices/${id}/pdf`, "http://localhost"));
  return await GET(request, { params: Promise.resolve({ id }) });
}

describe("GET /api/invoices/[id]/pdf", () => {
  it("returns 403 when the caller lacks invoices:view permission", async () => {
    asAdmin({}); // no permissions
    const res = await callRoute();
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("forbidden");
    expect(PermissionError).toBeInstanceOf(Function);
  });

  it("returns 403 for anonymous callers", async () => {
    asAnonymous();
    const res = await callRoute();
    expect(res.status).toBe(403);
  });

  it("returns a PDF for a Super Admin with the correct headers", async () => {
    asSuperAdmin();
    const admin = getAdminClient();
    admin.enqueueResponse({ data: makeInvoiceWithOrderStore(), error: null });
    admin.enqueueResponse({ data: makeStore(), error: null });
    admin.enqueueResponse({ data: makeGstNumber(), error: null });

    const res = await callRoute();
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
    const disposition = res.headers.get("Content-Disposition") ?? "";
    expect(disposition).toMatch(/^attachment;/);
    expect(disposition).toMatch(/filename="invoice-.*\.pdf"$/);
  });

  it("returns 404 when a store-scoped caller asks for an invoice from a different store", async () => {
    asAdmin({ invoices: ["view"] }, { storeId: "s-mine" });
    nextStoreScope = { storeId: "s-mine", isStoreScoped: true };
    const admin = getAdminClient();
    admin.enqueueResponse({ data: makeInvoiceWithOrderStore({ storeId: "s-other" }), error: null });
    admin.enqueueResponse({ data: makeStore(), error: null });
    admin.enqueueResponse({ data: makeGstNumber(), error: null });

    const res = await callRoute();
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("not_found");
  });

  it("allows a store-scoped caller to access an invoice from their own store", async () => {
    asAdmin({ invoices: ["view"] }, { storeId: "s-mine" });
    nextStoreScope = { storeId: "s-mine", isStoreScoped: true };
    const admin = getAdminClient();
    admin.enqueueResponse({ data: makeInvoiceWithOrderStore({ storeId: "s-mine" }), error: null });
    admin.enqueueResponse({ data: makeStore(), error: null });
    admin.enqueueResponse({ data: makeGstNumber(), error: null });

    const res = await callRoute();
    expect(res.status).toBe(200);
  });

  it("includes a non-empty PDF buffer in the response body", async () => {
    asSuperAdmin();
    const admin = getAdminClient();
    admin.enqueueResponse({ data: makeInvoiceWithOrderStore(), error: null });
    admin.enqueueResponse({ data: makeStore(), error: null });
    admin.enqueueResponse({ data: makeGstNumber(), error: null });

    const res = await callRoute();
    expect(res.status).toBe(200);
    const arrayBuffer = await res.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    expect(bytes.length).toBeGreaterThan(0);
    // Our mock returns a buffer starting with the PDF magic.
    expect(String.fromCharCode(bytes[0]!, bytes[1]!, bytes[2]!, bytes[3]!)).toBe("%PDF");
  });

  it("uses the invoice_number in the filename", async () => {
    asSuperAdmin();
    const admin = getAdminClient();
    const invoice = makeInvoiceWithOrderStore();
    invoice.invoice_number = "INV-2026-0042";
    admin.enqueueResponse({ data: invoice, error: null });
    admin.enqueueResponse({ data: makeStore(), error: null });
    admin.enqueueResponse({ data: makeGstNumber(), error: null });

    const res = await callRoute();
    const disposition = res.headers.get("Content-Disposition") ?? "";
    expect(disposition).toContain("INV-2026-0042");
  });

  it("does not cache the response (each download is fresh)", async () => {
    asSuperAdmin();
    const admin = getAdminClient();
    admin.enqueueResponse({ data: makeInvoiceWithOrderStore(), error: null });
    admin.enqueueResponse({ data: makeStore(), error: null });
    admin.enqueueResponse({ data: makeGstNumber(), error: null });

    const res = await callRoute();
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
  });
});
