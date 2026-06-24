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

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), back: vi.fn() }),
}));

vi.mock("@iconify/react", () => ({
  Icon: ({ icon, className }: { icon: string; className?: string }) => (
    <span data-icon={icon} className={className} />
  ),
}));

vi.mock("react-toastify", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  },
}));

import CartGroupClient from "./CartGroupClient";
import type { CartGroup } from "./actions";

const baseCart = (overrides: Partial<CartGroup> = {}): CartGroup => ({
  cart_id: "cart-abc-123-def",
  customer: { full_name: "Alice", phone: "98765", email: "a@x.com" },
  delivery_address: {
    full_name: "Alice",
    phone: "98765",
    address_line1: "12 Main St",
    address_line2: null,
    landmark: null,
    city: "Mumbai",
    state: "MH",
    pincode: "400001",
  },
  delivery_slot_id: "slot-1",
  delivery_date: "2026-06-25",
  payment_method: "upi",
  placed_at: "2026-06-24T10:00:00.000Z",
  total: 0,
  orders: [],
  ...overrides,
});

function render(cart: CartGroup = baseCart()) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  let root: Root | null = null;
  act(() => {
    root = createRoot(container);
    root.render(<CartGroupClient cart={cart} />);
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
  vi.restoreAllMocks();
});

describe("CartGroupClient (P54)", () => {
  it("renders the cart-group root", () => {
    const { container, cleanup } = render();
    expect(container.querySelector('[data-testid="cart-group-root"]')).not.toBeNull();
    cleanup();
  });

  it("renders customer name, phone, email", () => {
    const { container, cleanup } = render();
    expect(container.textContent).toContain("Alice");
    expect(container.textContent).toContain("98765");
    expect(container.textContent).toContain("a@x.com");
    cleanup();
  });

  it("renders the delivery address", () => {
    const { container, cleanup } = render();
    expect(container.textContent).toContain("12 Main St");
    expect(container.textContent).toContain("Mumbai");
    expect(container.textContent).toContain("400001");
    cleanup();
  });

  it("renders the delivery date, placed timestamp, and payment method", () => {
    const { container, cleanup } = render();
    // The exact text depends on the runtime's Intl locale support.
    // Accept any common en-US / en-IN / ISO format.
    expect(container.textContent).toMatch(/2026/);
    expect(container.textContent).toContain("upi");
    cleanup();
  });

  it("renders one sub-order card per order", () => {
    const cart = baseCart({
      total: 1580,
      orders: [
        {
          id: "o-1",
          order_number: "ORD-001",
          status: "delivered",
          payment_status: "paid",
          payment_method: "upi",
          subtotal: 1000,
          discount_amount: 0,
          tax_amount: 0,
          delivery_charge: 40,
          total_amount: 1040,
          placed_at: "2026-06-24T10:00:00.000Z",
          store_id: "s-1",
          invoice_id: "i-1",
          item_count: 2,
          stores: { name: "FreshCart", code: "FCD" },
        },
        {
          id: "o-2",
          order_number: "ORD-002",
          status: "pending",
          payment_status: "unpaid",
          payment_method: "upi",
          subtotal: 500,
          discount_amount: 0,
          tax_amount: 0,
          delivery_charge: 40,
          total_amount: 540,
          placed_at: "2026-06-24T10:00:01.000Z",
          store_id: "s-2",
          invoice_id: null,
          item_count: 1,
          stores: { name: "GreenMart", code: "GM" },
        },
      ],
    });
    const { container, cleanup } = render(cart);
    const card1 = container.querySelector('[data-testid="cart-sub-order-o-1"]');
    const card2 = container.querySelector('[data-testid="cart-sub-order-o-2"]');
    expect(card1).not.toBeNull();
    expect(card2).not.toBeNull();
    expect(card1?.textContent).toContain("FreshCart");
    expect(card1?.textContent).toContain("FCD");
    expect(card1?.textContent).toContain("delivered");
    expect(card2?.textContent).toContain("GreenMart");
    expect(card2?.textContent).toContain("pending");
    cleanup();
  });

  it("renders the grand total (sum of sub-order totals)", () => {
    const cart = baseCart({
      total: 1580,
      orders: [
        {
          id: "o-1", order_number: "ORD-001", status: "delivered", payment_status: "paid",
          payment_method: "upi", subtotal: 1000, discount_amount: 0, tax_amount: 0,
          delivery_charge: 40, total_amount: 1040, placed_at: "2026-06-24T10:00:00.000Z",
          store_id: "s-1", invoice_id: null, item_count: 1,
          stores: { name: "S1", code: "S1" },
        },
        {
          id: "o-2", order_number: "ORD-002", status: "pending", payment_status: "unpaid",
          payment_method: "upi", subtotal: 500, discount_amount: 0, tax_amount: 0,
          delivery_charge: 40, total_amount: 540, placed_at: "2026-06-24T10:00:01.000Z",
          store_id: "s-2", invoice_id: null, item_count: 1,
          stores: { name: "S2", code: "S2" },
        },
      ],
    });
    const { container, cleanup } = render(cart);
    const grand = container.querySelector('[data-testid="cart-grand-total"]');
    expect(grand).not.toBeNull();
    expect(grand?.textContent).toContain("₹1,580");
    cleanup();
  });

  it("renders [View Order] and [Invoice PDF] buttons when invoice exists", () => {
    const cart = baseCart({
      orders: [
        {
          id: "o-1", order_number: "ORD-001", status: "delivered", payment_status: "paid",
          payment_method: "upi", subtotal: 100, discount_amount: 0, tax_amount: 0,
          delivery_charge: 0, total_amount: 100, placed_at: "2026-06-24T10:00:00.000Z",
          store_id: "s-1", invoice_id: "i-1", item_count: 1,
          stores: { name: "S1", code: "S1" },
        },
      ],
    });
    const { container, cleanup } = render(cart);
    const viewBtn = container.querySelector('[data-testid="view-order-o-1"]');
    const downloadBtn = container.querySelector('[data-testid="download-invoice-o-1"]');
    expect(viewBtn).not.toBeNull();
    expect(viewBtn?.getAttribute("href")).toBe("/orders/o-1");
    expect(downloadBtn).not.toBeNull();
    expect(downloadBtn?.getAttribute("href")).toBe("/api/invoices/i-1/pdf");
    cleanup();
  });

  it("does NOT render the Invoice PDF button when invoice_id is null", () => {
    const cart = baseCart({
      orders: [
        {
          id: "o-1", order_number: "ORD-001", status: "pending", payment_status: "unpaid",
          payment_method: "cod", subtotal: 100, discount_amount: 0, tax_amount: 0,
          delivery_charge: 0, total_amount: 100, placed_at: "2026-06-24T10:00:00.000Z",
          store_id: "s-1", invoice_id: null, item_count: 1,
          stores: { name: "S1", code: "S1" },
        },
      ],
    });
    const { container, cleanup } = render(cart);
    const downloadBtn = container.querySelector('[data-testid="download-invoice-o-1"]');
    expect(downloadBtn).toBeNull();
    cleanup();
  });

  it("handles a missing customer profile gracefully", () => {
    const cart = baseCart({ customer: null });
    const { container, cleanup } = render(cart);
    expect(container.textContent).toContain("No profile");
    cleanup();
  });

  it("handles a missing delivery address gracefully", () => {
    const cart = baseCart({ delivery_address: null });
    const { container, cleanup } = render(cart);
    expect(container.textContent).toContain("No address");
    cleanup();
  });
});
