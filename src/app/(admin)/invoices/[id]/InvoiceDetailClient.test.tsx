// @vitest-environment jsdom
// Tell React 19 this is an act-enabled test environment (suppresses warnings)
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import { describe, it, expect, beforeEach, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock("@iconify/react", () => ({
  Icon: ({ icon, className }: { icon: string; className?: string }) => (
    <span data-icon={icon} className={className} />
  ),
}));

import InvoiceDetailClient from "./InvoiceDetailClient";
import type { InvoiceDetail, InvoiceStore } from "../actions";

const fakeInvoice: InvoiceDetail = {
  id: "i-1",
  order_id: "o-1",
  invoice_number: "INV-2026-0001",
  invoice_type: "original",
  taxable_amount: 1000,
  cgst: 90,
  sgst: 90,
  igst: null,
  total_amount: 1180,
  amount_in_words: null,
  status: "generated",
  pdf_url: null,
  invoice_date: "2026-06-21T00:00:00.000Z",
  created_at: "2026-06-21T00:00:00.000Z",
  orders: {
    order_number: "ORD-001",
    user_id: "u-1",
    placed_at: "2026-06-21T00:00:00.000Z",
    gstin: null,
    store_id: "s-1",
    // P43: the order's store is now also joined and exposed.
    stores: { name: "FreshCart", code: "A1B2C3D4" },
    profiles: { full_name: "Alice", phone: "+911234567890" },
    addresses: {
      full_name: "Alice",
      phone: "+911234567890",
      address_line1: "123 Main St",
      address_line2: null,
      landmark: null,
      city: "Bangalore",
      state: "KA",
      pincode: "560001",
    },
    order_items: [
      {
        id: "oi-1",
        quantity: 2,
        unit_price: 500,
        total_price: 1000,
        gst_rate: 18,
        gst_amount: 180,
        product_name: "Test Product",
        product_sku: "TP-001",
        variant_name: null,
        product_hsn_code: "1234",
        products: { name: "Test Product", hsn_code: "1234", gst_rate: 18 },
        product_variants: null,
      },
    ],
  },
  store: {
    name: "FreshCart",
    address: "123 Market St",
    city: "Bangalore",
    state: "KA",
    pincode: "560001",
    phone: "+911111111111",
    email: "store@example.com",
    gstin: "29ABCDE1234F1Z5",
    legal_name: "FreshCart Pvt Ltd",
  } satisfies InvoiceStore,
};

function renderInvoiceDetail(invoice: InvoiceDetail = fakeInvoice) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  let root: Root | null = null;
  act(() => {
    root = createRoot(container);
    root.render(<InvoiceDetailClient invoice={invoice} />);
  });
  return {
    container,
    cleanup: () => {
      act(() => {
        root?.unmount();
      });
      container.remove();
    },
  };
}

beforeEach(() => {
  // jsdom doesn't ship a real URL.createObjectURL; stub it.
  URL.createObjectURL = vi.fn(() => "blob:fake-url");
  URL.revokeObjectURL = vi.fn();
});

describe("InvoiceDetailClient (P39 download flow)", () => {
  it("renders the Download PDF button", () => {
    const { container, cleanup } = renderInvoiceDetail();
    const btn = container.querySelector('[data-testid="download-invoice-btn"]');
    expect(btn).not.toBeNull();
    expect(btn?.textContent).toMatch(/Download PDF/);
    cleanup();
  });

  it("renders the seller card with the store name and GSTIN when invoice.store is populated", () => {
    const { container, cleanup } = renderInvoiceDetail();
    const html = container.innerHTML;
    expect(html).toContain("FreshCart Pvt Ltd");
    expect(html).toContain("29ABCDE1234F1Z5");
    expect(html).toContain("Bangalore");
    cleanup();
  });

  it("does not render the seller card when invoice.store is null", () => {
    const invoiceWithoutStore = { ...fakeInvoice, store: null };
    const { container, cleanup } = renderInvoiceDetail(invoiceWithoutStore);
    // The seller card header text is "Seller"; with store=null it
    // should not be in the DOM. We look for the address text
    // instead since "Seller" is generic and might appear elsewhere.
    expect(container.innerHTML).not.toContain("29ABCDE1234F1Z5");
    cleanup();
  });

  it("calls fetch with the right URL when the Download PDF button is clicked", async () => {
    const fetchSpy = vi.fn(async () =>
      new Response(new Uint8Array([0x25, 0x50, 0x44, 0x46]), {
        status: 200,
        headers: { "Content-Type": "application/pdf" },
      }),
    );
    const originalFetch = globalThis.fetch;
    globalThis.fetch = fetchSpy as unknown as typeof globalThis.fetch;

    const { container, cleanup } = renderInvoiceDetail();
    const btn = container.querySelector<HTMLButtonElement>(
      '[data-testid="download-invoice-btn"]',
    );
    expect(btn).not.toBeNull();

    await act(async () => {
      btn!.click();
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const firstCall = fetchSpy.mock.calls[0] as unknown as [string, RequestInit?] | undefined;
    expect(firstCall).toBeDefined();
    const calledUrl = firstCall?.[0];
    expect(calledUrl).toBe("/api/invoices/i-1/pdf");

    globalThis.fetch = originalFetch;
    cleanup();
  });

  it("displays an error message when the fetch returns a non-OK status", async () => {
    const fetchSpy = vi.fn(async () =>
      new Response("forbidden", { status: 403 }),
    );
    const originalFetch = globalThis.fetch;
    globalThis.fetch = fetchSpy as unknown as typeof globalThis.fetch;

    const { container, cleanup } = renderInvoiceDetail();
    const btn = container.querySelector<HTMLButtonElement>(
      '[data-testid="download-invoice-btn"]',
    );

    await act(async () => {
      btn!.click();
    });

    expect(container.innerHTML).toMatch(/forbidden/);
    globalThis.fetch = originalFetch;
    cleanup();
  });

  it("disables the button while the download is in flight", async () => {
    let resolveFetch: (r: Response) => void = () => {};
    const fetchSpy = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          resolveFetch = resolve;
        }),
    );
    const originalFetch = globalThis.fetch;
    globalThis.fetch = fetchSpy as unknown as typeof globalThis.fetch;

    const { container, cleanup } = renderInvoiceDetail();
    const btn = container.querySelector<HTMLButtonElement>(
      '[data-testid="download-invoice-btn"]',
    )!;

    act(() => {
      btn.click();
    });

    // While fetch is in flight, the button should be disabled.
    expect(btn.disabled).toBe(true);
    expect(btn.textContent).toMatch(/Downloading/);

    // Resolve the fetch to clean up.
    await act(async () => {
      resolveFetch(new Response(new Uint8Array([0x25, 0x50, 0x44, 0x46])));
    });

    expect(btn.disabled).toBe(false);
    globalThis.fetch = originalFetch;
    cleanup();
  });
});
