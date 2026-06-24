// @vitest-environment jsdom
// Tell React 19 this is an act-enabled test environment (suppresses warnings)
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import { describe, it, expect, beforeEach, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";

const { refreshMock, pushMock } = vi.hoisted(() => ({
  refreshMock: vi.fn(),
  pushMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: refreshMock, push: pushMock, back: vi.fn() }),
}));

vi.mock("@iconify/react", () => ({
  Icon: ({ icon, className }: { icon: string; className?: string }) => (
    <span data-icon={icon} className={className} />
  ),
}));

vi.mock("react-toastify", () => ({
  toast: {
    success: (...args: unknown[]) => (successMock(...args)),
    error: (...args: unknown[]) => (errorMock(...args)),
  },
}));

const { successMock, errorMock, updateOrderStatusMock, updatePaymentStatusMock } = vi.hoisted(
  () => ({
    successMock: vi.fn(),
    errorMock: vi.fn(),
    updateOrderStatusMock: vi.fn(),
    updatePaymentStatusMock: vi.fn(),
  }),
);

vi.mock("../actions", () => ({
  updateOrderStatus: (...args: unknown[]) => updateOrderStatusMock(...args),
  updatePaymentStatus: (...args: unknown[]) => updatePaymentStatusMock(...args),
}));

import OrderActionControls from "./OrderActionControls";

function render(props: {
  orderId: string;
  currentStatus: "pending" | "confirmed" | "processing" | "shipped" | "delivered" | "cancelled" | "returned";
  currentPaymentStatus: "unpaid" | "paid" | "refunded" | "partially_refunded";
}) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  let root: Root | null = null;
  act(() => {
    root = createRoot(container);
    root.render(<OrderActionControls {...props} />);
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
  refreshMock.mockReset();
  pushMock.mockReset();
  successMock.mockReset();
  errorMock.mockReset();
  updateOrderStatusMock.mockReset();
  updatePaymentStatusMock.mockReset();
});

describe("OrderActionControls (P54 — shared status + payment controls)", () => {
  it("renders both Update Status and Update Payment buttons when status is pending", () => {
    const { container, cleanup } = render({
      orderId: "o-1",
      currentStatus: "pending",
      currentPaymentStatus: "unpaid",
    });
    expect(container.querySelector('[data-testid="open-status-modal"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="open-payment-modal"]')).not.toBeNull();
    cleanup();
  });

  it("hides Update Status when the status is terminal (cancelled/returned/delivered)", () => {
    for (const status of ["cancelled", "returned", "delivered"] as const) {
      const { container, cleanup } = render({
        orderId: "o-1",
        currentStatus: status,
        currentPaymentStatus: "paid",
      });
      expect(container.querySelector('[data-testid="open-status-modal"]')).toBeNull();
      // Update Payment stays visible so refunds can be applied
      expect(container.querySelector('[data-testid="open-payment-modal"]')).not.toBeNull();
      cleanup();
    }
  });

  it("opens the status modal and calls updateOrderStatus with the chosen status + notes", async () => {
    updateOrderStatusMock.mockResolvedValue({ invoiceId: null });
    const { container, cleanup } = render({
      orderId: "o-99",
      currentStatus: "pending",
      currentPaymentStatus: "unpaid",
    });

    const openBtn = container.querySelector('[data-testid="open-status-modal"]') as HTMLButtonElement;
    await act(async () => { openBtn.click(); });
    expect(container.querySelector('[data-testid="status-modal"]')).not.toBeNull();

    // Change the select to 'confirmed'
    const select = container.querySelector('[data-testid="status-select"]') as HTMLSelectElement;
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!;
      setter.call(select, "confirmed");
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });

    // Add a note
    const notes = container.querySelector('[data-testid="status-notes"]') as HTMLTextAreaElement;
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!;
      setter.call(notes, "Customer confirmed by phone");
      notes.dispatchEvent(new Event("input", { bubbles: true }));
    });

    // Click confirm
    const confirmBtn = container.querySelector('[data-testid="confirm-status-update"]') as HTMLButtonElement;
    await act(async () => { confirmBtn.click(); });

    expect(updateOrderStatusMock).toHaveBeenCalledTimes(1);
    expect(updateOrderStatusMock).toHaveBeenCalledWith("o-99", "confirmed", "Customer confirmed by phone");
    expect(successMock).toHaveBeenCalled();
    expect(refreshMock).toHaveBeenCalled();
    cleanup();
  });

  it("shows the P44 toast when the new status is 'delivered' and an invoiceId comes back", async () => {
    updateOrderStatusMock.mockResolvedValue({ invoiceId: "i-new" });
    const { container, cleanup } = render({
      orderId: "o-1",
      currentStatus: "shipped",
      currentPaymentStatus: "unpaid",
    });

    await act(async () => {
      (container.querySelector('[data-testid="open-status-modal"]') as HTMLButtonElement).click();
    });
    act(() => {
      const select = container.querySelector('[data-testid="status-select"]') as HTMLSelectElement;
      const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!;
      setter.call(select, "delivered");
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await act(async () => {
      (container.querySelector('[data-testid="confirm-status-update"]') as HTMLButtonElement).click();
    });

    expect(successMock).toHaveBeenCalledWith(
      "Status updated to delivered. Invoice generated.",
    );
    cleanup();
  });

  it("opens the payment modal and calls updatePaymentStatus", async () => {
    updatePaymentStatusMock.mockResolvedValue(undefined);
    const { container, cleanup } = render({
      orderId: "o-1",
      currentStatus: "delivered",
      currentPaymentStatus: "unpaid",
    });

    await act(async () => {
      (container.querySelector('[data-testid="open-payment-modal"]') as HTMLButtonElement).click();
    });
    expect(container.querySelector('[data-testid="payment-modal"]')).not.toBeNull();

    act(() => {
      const select = container.querySelector('[data-testid="payment-select"]') as HTMLSelectElement;
      const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!;
      setter.call(select, "paid");
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await act(async () => {
      (container.querySelector('[data-testid="confirm-payment-update"]') as HTMLButtonElement).click();
    });

    expect(updatePaymentStatusMock).toHaveBeenCalledWith("o-1", "paid");
    expect(successMock).toHaveBeenCalled();
    expect(refreshMock).toHaveBeenCalled();
    cleanup();
  });

  it("toasts an error and does NOT call refresh when updateOrderStatus throws", async () => {
    updateOrderStatusMock.mockRejectedValue(new Error("network down"));
    const { container, cleanup } = render({
      orderId: "o-1",
      currentStatus: "pending",
      currentPaymentStatus: "unpaid",
    });

    await act(async () => {
      (container.querySelector('[data-testid="open-status-modal"]') as HTMLButtonElement).click();
    });
    act(() => {
      const select = container.querySelector('[data-testid="status-select"]') as HTMLSelectElement;
      const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!;
      setter.call(select, "confirmed");
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    refreshMock.mockClear();
    await act(async () => {
      (container.querySelector('[data-testid="confirm-status-update"]') as HTMLButtonElement).click();
    });

    expect(errorMock).toHaveBeenCalledWith("Failed to update status");
    expect(refreshMock).not.toHaveBeenCalled();
    cleanup();
  });
});
