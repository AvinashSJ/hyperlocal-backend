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

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: vi.fn(),
    push: vi.fn(),
    back: vi.fn(),
  }),
}));

const toastSuccess = vi.fn();
const toastError = vi.fn();
vi.mock("react-toastify", () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccess(...args),
    error: (...args: unknown[]) => toastError(...args),
  },
}));

const mockRecordPayment = vi.fn();
const mockDeletePayment = vi.fn();
vi.mock("../actions", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../actions")>();
  return {
    ...actual,
    recordPayment: (...args: unknown[]) => mockRecordPayment(...args),
    deleteCommissionPayment: (...args: unknown[]) => mockDeletePayment(...args),
  };
});

import CommissionDetailClient from "./CommissionDetailClient";
import type { CommissionRow, CommissionPayment } from "../actions";

const baseCommission = (overrides: Partial<CommissionRow> = {}): CommissionRow => ({
  id: "c-1",
  store_id: "s-1",
  store_name: "FreshCart",
  period_start: "2025-01-01",
  period_end: "2025-01-31",
  total_revenue: 10000,
  commission_rate: 10,
  commission_amount: 1000,
  balance_due: 600,
  status: "partially_paid",
  notes: null,
  created_at: "2025-02-01T00:00:00.000Z",
  ...overrides,
});

const basePayment = (overrides: Partial<CommissionPayment> = {}): CommissionPayment => ({
  id: "p-1",
  commission_id: "c-1",
  amount: 200,
  notes: "First installment",
  created_by: "u-1",
  created_by_name: "Alice Admin",
  created_at: "2025-02-05T10:00:00.000Z",
  ...overrides,
});

function render(
  commission: CommissionRow = baseCommission(),
  payments: CommissionPayment[] = [],
  canEdit = true,
  canDelete = true,
) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  let root: Root | null = null;
  act(() => {
    root = createRoot(container);
    root.render(
      <CommissionDetailClient
        commission={commission}
        payments={payments}
        actionPerms={{ canView: true, canCreate: true, canEdit, canDelete }}
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

beforeEach(() => {
  mockRecordPayment.mockReset();
  mockDeletePayment.mockReset();
  toastSuccess.mockReset();
  toastError.mockReset();
});

describe("CommissionDetailClient (P46)", () => {
  it("renders the balance due in red when > 0, green when 0", () => {
    const { container, cleanup } = render(
      baseCommission({ balance_due: 600, commission_amount: 1000 }),
    );
    const el = container.querySelector('[data-testid="commission-balance-due"]');
    expect(el?.textContent).toMatch(/600/);
    expect(el?.className).toContain("text-danger");
    cleanup();

    const c2 = render(baseCommission({ balance_due: 0, commission_amount: 1000 }));
    const el2 = c2.container.querySelector('[data-testid="commission-balance-due"]');
    expect(el2?.className).toContain("text-success");
    c2.cleanup();
  });

  it("shows the Total / Paid / Balance summary row (Paid = Total - Balance)", () => {
    const { container, cleanup } = render(
      baseCommission({ total_revenue: 10000, commission_amount: 1000, balance_due: 600 }),
    );
    const summary = container.querySelector('[data-testid="commission-summary-row"]');
    expect(summary).not.toBeNull();
    expect(summary?.textContent).toMatch(/Total:/);
    expect(summary?.textContent).toMatch(/1,000/);
    expect(summary?.textContent).toMatch(/Paid:/);
    expect(summary?.textContent).toMatch(/400/); // 1000 - 600
    expect(summary?.textContent).toMatch(/Balance:/);
    expect(summary?.textContent).toMatch(/600/);
    cleanup();
  });

  it("clamps Paid to 0 when balance_due > commission_amount (out-of-band negative)", () => {
    const { container, cleanup } = render(
      baseCommission({ commission_amount: 1000, balance_due: 1500 }),
    );
    const summary = container.querySelector('[data-testid="commission-summary-row"]');
    // Paid is max(1000 - 1500, 0) = 0
    expect(summary?.textContent).toMatch(/Paid:\s*₹0/);
    cleanup();
  });

  it("renders the Record Payment button for Super Admin even when balance is 0 (P46)", () => {
    const { container, cleanup } = render(
      baseCommission({ balance_due: 0, commission_amount: 1000 }),
    );
    const btn = container.querySelector('[data-testid="commission-record-payment-btn"]');
    expect(btn).not.toBeNull();
    // Button text changes to clarify
    expect(btn?.textContent).toMatch(/Credit/);
    cleanup();
  });

  it("renders the standard Record Payment label when balance > 0", () => {
    const { container, cleanup } = render(
      baseCommission({ balance_due: 600, commission_amount: 1000 }),
    );
    const btn = container.querySelector('[data-testid="commission-record-payment-btn"]');
    expect(btn?.textContent).toMatch(/Record Payment$/);
    cleanup();
  });

  it("hides the Record Payment button when canEdit is false", () => {
    const { container, cleanup } = render(
      baseCommission({ balance_due: 600 }),
      [],
      false,
    );
    const btn = container.querySelector('[data-testid="commission-record-payment-btn"]');
    expect(btn).toBeNull();
    cleanup();
  });

  it("renders the payment history list", () => {
    const payments = [basePayment({ id: "p-1" }), basePayment({ id: "p-2", amount: 200 })];
    const { container, cleanup } = render(baseCommission(), payments);
    expect(container.textContent).toMatch(/Payment History \(2\)/);
    expect(container.textContent).toMatch(/Alice Admin/);
    expect(container.textContent).toMatch(/First installment/);
    cleanup();
  });

  it("shows the empty state when there are no payments", () => {
    const { container, cleanup } = render(baseCommission(), []);
    expect(container.textContent).toMatch(/No payments recorded yet/);
    cleanup();
  });

  it("opens the Record Payment modal when the button is clicked", () => {
    const { container, cleanup } = render(baseCommission());
    const btn = container.querySelector<HTMLButtonElement>(
      '[data-testid="commission-record-payment-btn"]',
    )!;
    act(() => {
      btn.click();
    });
    // The modal renders a second copy of the form input with data-testid
    const input = container.querySelector('[data-testid="commission-payment-amount-input"]');
    expect(input).not.toBeNull();
    cleanup();
  });

  it("submits the payment, shows success toast, and refreshes on success", async () => {
    mockRecordPayment.mockResolvedValueOnce(undefined);
    const { container, cleanup } = render(baseCommission());

    const btn = container.querySelector<HTMLButtonElement>(
      '[data-testid="commission-record-payment-btn"]',
    )!;
    await act(async () => {
      btn.click();
    });

    const submit = container.querySelector<HTMLButtonElement>(
      '[data-testid="commission-payment-submit"]',
    )!;
    const form = submit.closest("form")! as HTMLFormElement;
    // Set the amount input value via the native setter so React picks it up
    const amountInput = form.querySelector<HTMLInputElement>('input[name="amount"]')!;
    const nativeSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value",
    )?.set;
    nativeSetter?.call(amountInput, "300");
    amountInput.dispatchEvent(new Event("input", { bubbles: true }));

    await act(async () => {
      // Trigger a real form submit event so React's <form action={fn}> fires
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });

    expect(mockRecordPayment).toHaveBeenCalledTimes(1);
    expect(toastSuccess).toHaveBeenCalledWith("Payment recorded");
    expect(toastError).not.toHaveBeenCalled();
    cleanup();
  });

  it("shows the error toast and renders the inline error on failure", async () => {
    mockRecordPayment.mockRejectedValueOnce(new Error("Amount exceeds balance"));
    const { container, cleanup } = render(baseCommission());

    const btn = container.querySelector<HTMLButtonElement>(
      '[data-testid="commission-record-payment-btn"]',
    )!;
    await act(async () => {
      btn.click();
    });

    const submit = container.querySelector<HTMLButtonElement>(
      '[data-testid="commission-payment-submit"]',
    )!;
    const form = submit.closest("form")! as HTMLFormElement;
    const amountInput = form.querySelector<HTMLInputElement>('input[name="amount"]')!;
    const nativeSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value",
    )?.set;
    nativeSetter?.call(amountInput, "999999");
    amountInput.dispatchEvent(new Event("input", { bubbles: true }));

    await act(async () => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });

    expect(toastError).toHaveBeenCalledWith("Amount exceeds balance");
    // The inline error alert is visible
    expect(container.textContent).toMatch(/Amount exceeds balance/);
    cleanup();
  });

  it("opens the delete-payment modal when a delete button is clicked", () => {
    const { container, cleanup } = render(
      baseCommission(),
      [basePayment({ id: "p-1" })],
    );
    const delBtn = container.querySelector<HTMLButtonElement>(
      '[data-testid="commission-payment-delete-p-1"]',
    )!;
    act(() => {
      delBtn.click();
    });
    expect(container.textContent).toMatch(/Are you sure/);
    expect(container.textContent).toMatch(/200/);
    cleanup();
  });

  it("calls deleteCommissionPayment and shows success toast on confirm", async () => {
    mockDeletePayment.mockResolvedValueOnce(undefined);
    const { container, cleanup } = render(
      baseCommission(),
      [basePayment({ id: "p-1" })],
    );
    const delBtn = container.querySelector<HTMLButtonElement>(
      '[data-testid="commission-payment-delete-p-1"]',
    )!;
    await act(async () => {
      delBtn.click();
    });

    const confirm = container.querySelector<HTMLButtonElement>(
      '[data-testid="commission-payment-delete-confirm"]',
    )!;
    const form = confirm.closest("form")! as HTMLFormElement;
    await act(async () => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });

    expect(mockDeletePayment).toHaveBeenCalledTimes(1);
    expect(toastSuccess).toHaveBeenCalledWith("Payment deleted");
    cleanup();
  });

  it("hides the delete button when canDelete is false", () => {
    const { container, cleanup } = render(
      baseCommission(),
      [basePayment({ id: "p-1" })],
      true,
      false,
    );
    const delBtn = container.querySelector(
      '[data-testid="commission-payment-delete-p-1"]',
    );
    expect(delBtn).toBeNull();
    cleanup();
  });
});
