// @vitest-environment jsdom
// Tell React 19 this is an act-enabled test environment (suppresses warnings)
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import { describe, it, expect, beforeEach, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";

const { pushMock, refreshMock } = vi.hoisted(() => ({
  pushMock: vi.fn(),
  refreshMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, refresh: refreshMock, back: vi.fn() }),
}));

vi.mock("react-toastify", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  },
}));

vi.mock("@iconify/react", () => ({
  Icon: ({ icon, className }: { icon: string; className?: string }) => (
    <span data-icon={icon} className={className} />
  ),
}));

import OrdersClient from "./OrdersClient";
import type { OrderListItem } from "./actions";

const baseOrder = (overrides: Partial<OrderListItem> = {}): OrderListItem => ({
  id: "o-1",
  order_number: "ORD-001",
  user_id: "u-1",
  status: "delivered",
  total_amount: 1040,
  payment_status: "paid",
  payment_method: "upi",
  delivery_date: "2026-06-25",
  placed_at: "2026-06-24T10:00:00.000Z",
  created_at: "2026-06-24T10:00:00.000Z",
  store_id: "s-1",
  invoice_id: null,
  profiles: { full_name: "Alice", phone: "98765" },
  stores: { name: "FreshCart", code: "FCD" },
  ...overrides,
});

const fullPerms = {
  canView: true,
  canCreate: true,
  canEdit: true,
  canDelete: true,
};

function render(
  orders: OrderListItem[] = [baseOrder()],
  actionPerms = fullPerms,
) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  let root: Root | null = null;
  act(() => {
    root = createRoot(container);
    root.render(<OrdersClient orders={orders} actionPerms={actionPerms} />);
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
  pushMock.mockReset();
  refreshMock.mockReset();
});

describe("OrdersClient (P56): download invoice button in action column", () => {
  it("does NOT render the download button when invoice_id is null", () => {
    const { container, cleanup } = render([baseOrder({ invoice_id: null })]);
    const row = container.querySelector('[data-testid="order-row-download-invoice-o-1"]');
    expect(row).toBeNull();
    cleanup();
  });

  it("renders the download button when invoice_id is set, with the right href", () => {
    const { container, cleanup } = render([
      baseOrder({ id: "o-9", invoice_id: "i-42" }),
    ]);
    const link = container.querySelector(
      '[data-testid="order-row-download-invoice-o-9"]',
    ) as HTMLAnchorElement;
    expect(link).not.toBeNull();
    expect(link.getAttribute("href")).toBe("/api/invoices/i-42/pdf");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
    expect(link.getAttribute("download")).not.toBeNull();
    // btn-outline-success matches the success-themed invoice CTA
    expect(link.className).toContain("btn-outline-success");
    cleanup();
  });

  it("renders the delete button alongside the download button when canDelete is true", () => {
    const { container, cleanup } = render(
      [baseOrder({ id: "o-2", invoice_id: "i-2" })],
      fullPerms,
    );
    const row = container.querySelector("tbody tr");
    const buttons = row?.querySelectorAll("button, a") ?? [];
    // 1 download link + 1 delete button
    expect(buttons.length).toBe(2);
    const download = row?.querySelector(
      '[data-testid="order-row-download-invoice-o-2"]',
    );
    const deleteBtn = row?.querySelector('button[title="Delete"]');
    expect(download).not.toBeNull();
    expect(deleteBtn).not.toBeNull();
    cleanup();
  });

  it("hides the delete button (but keeps the download button) when canDelete is false", () => {
    const { container, cleanup } = render(
      [baseOrder({ id: "o-3", invoice_id: "i-3" })],
      { canView: true, canCreate: false, canEdit: false, canDelete: false },
    );
    const row = container.querySelector("tbody tr");
    const download = row?.querySelector(
      '[data-testid="order-row-download-invoice-o-3"]',
    );
    const deleteBtn = row?.querySelector('button[title="Delete"]');
    expect(download).not.toBeNull();
    expect(deleteBtn).toBeNull();
    cleanup();
  });

  it("renders a download button per row when multiple orders have invoices", () => {
    const orders = [
      baseOrder({ id: "o-A", invoice_id: "i-A" }),
      baseOrder({ id: "o-B", invoice_id: "i-B" }),
      baseOrder({ id: "o-C", invoice_id: null }),
    ];
    const { container, cleanup } = render(orders);
    expect(container.querySelector('[data-testid="order-row-download-invoice-o-A"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="order-row-download-invoice-o-B"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="order-row-download-invoice-o-C"]')).toBeNull();
    cleanup();
  });
});
