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

import StoreDetailClient from "./StoreDetailClient";
import type { StoreRow, StoreRelations } from "../actions";
import type { Product } from "@/lib/types/supabase";

const baseStore = (overrides: Partial<StoreRow> = {}): StoreRow => ({
  id: "s-1",
  name: "FreshCart Downtown",
  slug: "freshcart-downtown",
  code: "FCD",
  logo_url: null,
  banner_url: null,
  phone: "+91 98765 43210",
  email: "downtown@freshcart.test",
  address: "12 Main St",
  city: "Mumbai",
  state: "MH",
  delivery_radius_km: 5,
  commission_rate: 10,
  order_id_prefix: null,
  is_open: true,
  is_active: true,
  updated_at: "2025-02-01T00:00:00.000Z",
  created_at: "2024-01-01T00:00:00.000Z",
  ...overrides,
});

const baseProduct = (overrides: Partial<Product> = {}): Product => ({
  id: "p-1",
  name: "Tomato",
  sku: "TOM-1",
  mrp: 50,
  stock_quantity: 100,
  status: "active",
  ...overrides,
} as Product);

const baseRelations = (overrides: Partial<StoreRelations> = {}): StoreRelations => ({
  zones: 1,
  gstNumbers: 1,
  orderCount: 0,
  orders: [],
  customerCount: 0,
  customers: [],
  invoiceCount: 0,
  invoices: [],
  productCount: 0,
  products: [],
  ...overrides,
});

function render(
  store: StoreRow = baseStore(),
  relations: StoreRelations = baseRelations(),
  canEdit = true,
  primaryGstin?: { gstin: string; legal_name: string; state_code: string | null } | null,
) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  let root: Root | null = null;
  act(() => {
    root = createRoot(container);
    root.render(
      <StoreDetailClient
        store={store}
        relations={relations}
        actionPerms={{ canView: true, canCreate: true, canEdit, canDelete: true }}
        primaryGstin={primaryGstin}
      />,
    );
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

describe("StoreDetailClient (P49)", () => {
  beforeEach(() => {
    // No-op: each render creates its own root.
  });

  it("renders the store name and code", () => {
    const { container, cleanup } = render();
    expect(container.querySelector('[data-testid="store-name"]')?.textContent).toBe(
      "FreshCart Downtown",
    );
    expect(container.querySelector('[data-testid="store-code"]')?.textContent).toBe("FCD");
    cleanup();
  });

  it("shows 4 summary stat cards with counts from relations", () => {
    const { container, cleanup } = render(
      baseStore(),
      baseRelations({
        orderCount: 25,
        customerCount: 12,
        invoiceCount: 8,
        productCount: 40,
      }),
    );
    expect(container.querySelector('[data-testid="stat-orders"]')?.textContent).toBe("25");
    expect(container.querySelector('[data-testid="stat-customers"]')?.textContent).toBe("12");
    expect(container.querySelector('[data-testid="stat-invoices"]')?.textContent).toBe("8");
    expect(container.querySelector('[data-testid="stat-products"]')?.textContent).toBe("40");
    cleanup();
  });

  it("hides the Edit Store button when canEdit is false", () => {
    const { container, cleanup } = render(baseStore(), baseRelations(), false);
    expect(container.querySelector('[data-testid="edit-store-btn"]')).toBeNull();
    cleanup();
  });

  it("shows the Edit Store link when canEdit is true", () => {
    const { container, cleanup } = render(baseStore(), baseRelations(), true);
    const btn = container.querySelector('[data-testid="edit-store-btn"]') as HTMLAnchorElement;
    expect(btn).not.toBeNull();
    expect(btn.getAttribute("href")).toBe("/settings?store_id=s-1");
    cleanup();
  });

  it("renders the orders section rows with customer names + amounts", () => {
    const { container, cleanup } = render(
      baseStore(),
      baseRelations({
        orderCount: 2,
        orders: [
          {
            id: "o-1",
            order_number: "ORD-001",
            user_id: "u-1",
            total_amount: 1500,
            status: "delivered",
            placed_at: "2025-02-01T00:00:00.000Z",
            customer_name: "Alice",
          },
          {
            id: "o-2",
            order_number: "ORD-002",
            user_id: "u-2",
            total_amount: 250,
            status: "pending",
            placed_at: "2025-02-02T00:00:00.000Z",
            customer_name: null,
          },
        ],
      }),
    );
    const row1 = container.querySelector('[data-testid="detail-order-row-o-1"]');
    expect(row1?.textContent).toMatch(/ORD-001/);
    expect(row1?.textContent).toMatch(/Alice/);
    expect(row1?.textContent).toMatch(/1,500/);
    const row2 = container.querySelector('[data-testid="detail-order-row-o-2"]');
    expect(row2?.textContent).toMatch(/—/); // null customer_name
    cleanup();
  });

  it("shows 'showing N of M' header when the list is truncated", () => {
    const { container, cleanup } = render(
      baseStore(),
      baseRelations({
        orderCount: 100,
        orders: [
          {
            id: "o-1",
            order_number: "ORD-001",
            user_id: "u-1",
            total_amount: 1,
            status: "delivered",
            placed_at: "2025-02-01T00:00:00.000Z",
            customer_name: "Alice",
          },
        ],
        customerCount: 50,
        customers: [
          { id: "u-1", full_name: "Alice", email: "a@x.test", phone: "1", order_count: 1 },
        ],
      }),
    );
    const ordersSection = container.querySelector('[data-testid="store-detail-orders-section"]');
    expect(ordersSection?.textContent).toMatch(/showing 1 of 100/);
    cleanup();
  });

  it("renders customer section with order counts", () => {
    const { container, cleanup } = render(
      baseStore(),
      baseRelations({
        customerCount: 1,
        customers: [
          { id: "u-1", full_name: "Bob", email: "b@x.test", phone: "987", order_count: 7 },
        ],
      }),
    );
    const row = container.querySelector('[data-testid="detail-customer-row-u-1"]');
    expect(row?.textContent).toMatch(/Bob/);
    expect(row?.textContent).toMatch(/987/);
    expect(row?.textContent).toMatch(/7/);
    cleanup();
  });

  it("renders the products section with status badges", () => {
    const { container, cleanup } = render(
      baseStore(),
      baseRelations({
        productCount: 1,
        products: [baseProduct({ id: "p-1", name: "Onion", mrp: 30, stock_quantity: 50, status: "active" })],
      }),
    );
    const row = container.querySelector('[data-testid="detail-product-row-p-1"]');
    expect(row?.textContent).toMatch(/Onion/);
    expect(row?.textContent).toMatch(/TOM-1/);
    expect(row?.textContent).toMatch(/30/);
    expect(row?.textContent).toMatch(/50/);
    cleanup();
  });

  it("shows 'No X' empty states when lists are empty", () => {
    const { container, cleanup } = render(baseStore(), baseRelations());
    const orders = container.querySelector('[data-testid="store-detail-orders-section"]');
    const customers = container.querySelector('[data-testid="store-detail-customers-section"]');
    const invoices = container.querySelector('[data-testid="store-detail-invoices-section"]');
    const products = container.querySelector('[data-testid="store-detail-products-section"]');
    expect(orders?.textContent).toMatch(/No orders/);
    expect(customers?.textContent).toMatch(/No customers/);
    expect(invoices?.textContent).toMatch(/No invoices/);
    expect(products?.textContent).toMatch(/No products/);
    cleanup();
  });

  it("renders the GST Information card with the primary GSTIN when set", () => {
    const { container, cleanup } = render(
      baseStore(),
      baseRelations(),
      true,
      { gstin: "29ABCDE1234F1Z5", legal_name: "FreshCart Pvt Ltd", state_code: "29" },
    );
    const card = container.querySelector('[data-testid="store-detail-gst-card"]');
    expect(card).not.toBeNull();
    const gstinEl = container.querySelector('[data-testid="store-detail-primary-gstin"]');
    expect(gstinEl?.textContent).toBe("29ABCDE1234F1Z5");
    expect(card?.textContent).toMatch(/FreshCart Pvt Ltd/);
    expect(card?.textContent).toMatch(/29/);
    const manageLink = container.querySelector('[data-testid="store-detail-gst-manage-link"]') as HTMLAnchorElement;
    expect(manageLink?.getAttribute("href")).toBe("/gst-numbers?store_id=s-1");
    cleanup();
  });

  it("shows 'No primary GSTIN configured' when primaryGstin is null", () => {
    const { container, cleanup } = render(baseStore(), baseRelations(), true, null);
    const empty = container.querySelector('[data-testid="store-detail-no-gstin"]');
    expect(empty).not.toBeNull();
    expect(empty?.textContent).toMatch(/No primary GSTIN configured/);
    cleanup();
  });
});
