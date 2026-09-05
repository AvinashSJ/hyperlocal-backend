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

const routerRefresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: routerRefresh,
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

const mockGenerate = vi.fn();
vi.mock("../../actions", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../actions")>();
  return {
    ...actual,
    generateCommissionForPeriod: (...args: unknown[]) => mockGenerate(...args),
  };
});

import StoreCommissionsClient from "./StoreCommissionsClient";
import type { CommissionPeriod } from "../../actions";

const basePeriod = (overrides: Partial<CommissionPeriod> = {}): CommissionPeriod => ({
  id: "p-1",
  period_start: "2026-08-30",
  period_end: "2026-09-06",
  total_revenue: 40865,
  commission_rate: 1,
  commission_amount: 408.65,
  paid_amount: 0,
  balance_due: 408.65,
  status: "unpaid",
  generated: true,
  notes: null,
  ...overrides,
});

const baseStore = {
  id: "s-1",
  name: "ARUUN DOORSTEP",
  code: "AD",
  commission_rate: 1,
};

function render(
  periods: CommissionPeriod[] = [],
  actionPerms: { canView: boolean; canCreate: boolean; canEdit: boolean; canDelete: boolean } = {
    canView: true,
    canCreate: false,
    canEdit: true,
    canDelete: false,
  },
) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  let root: Root | null = null;
  act(() => {
    root = createRoot(container);
    root.render(
      <StoreCommissionsClient store={baseStore} periods={periods} actionPerms={actionPerms} />,
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
  mockGenerate.mockReset();
  toastSuccess.mockReset();
  toastError.mockReset();
  routerRefresh.mockReset();
});

describe("StoreCommissionsClient: weekly snapshot periods", () => {
  it("renders the period count and the summary totals from stored amounts", () => {
    const { container, cleanup } = render([basePeriod()]);
    expect(container.textContent).toMatch(/Commission Periods \(1\)/);
    // Total = 408.65 → displayed rounded to 409
    expect(container.textContent).toMatch(/Total:\s*₹409/);
    expect(container.textContent).toMatch(/Paid:\s*₹0/);
    expect(container.textContent).toMatch(/Balance:\s*₹409/);
    cleanup();
  });

  it("renders a locked (generated) week's stored revenue and commission", () => {
    const { container, cleanup } = render([basePeriod()]);
    expect(container.textContent).toMatch(/40,865/);
    expect(container.textContent).toMatch(/408.65/); // not 409 (exact stored)
    expect(container.textContent).toMatch(/Unpaid/);
    cleanup();
  });

  it("shows a Generate button for an ungenerated current week when canEdit", () => {
    const { container, cleanup } = render([
      basePeriod({ id: "p-cur", total_revenue: 0, commission_amount: 0, balance_due: 0, status: "paid", generated: false }),
    ]);
    const btn = container.querySelector<HTMLButtonElement>('[data-testid="store-commission-generate-p-cur"]');
    expect(btn).not.toBeNull();
    // The hidden field carries the period id to the server action
    const form = btn?.closest("form");
    const hidden = form?.querySelector<HTMLInputElement>('input[name="period_id"]');
    expect(hidden?.value).toBe("p-cur");
    cleanup();
  });

  it("does NOT show a Generate button for an already-generated period", () => {
    const { container, cleanup } = render([basePeriod()]);
    expect(container.querySelector('[data-testid="store-commission-generate-p-1"]')).toBeNull();
    cleanup();
  });

  it("hides the Generate button when the user cannot edit", () => {
    const { container, cleanup } = render(
      [basePeriod({ id: "p-cur", total_revenue: 0, commission_amount: 0, balance_due: 0, status: "paid", generated: false })],
      { canView: true, canCreate: false, canEdit: false, canDelete: false },
    );
    expect(container.querySelector('[data-testid="store-commission-generate-p-cur"]')).toBeNull();
    // The detail link is still available
    expect(container.querySelector('[data-testid="store-commission-view-p-cur"]')).not.toBeNull();
    cleanup();
  });

  it("submits Generate and shows a success toast + refresh on success", async () => {
    mockGenerate.mockResolvedValueOnce(undefined);
    const { container, cleanup } = render([
      basePeriod({ id: "p-cur", total_revenue: 0, commission_amount: 0, balance_due: 0, status: "paid", generated: false }),
    ]);

    const btn = container.querySelector<HTMLButtonElement>(
      '[data-testid="store-commission-generate-p-cur"]',
    )!;
    const form = btn.closest("form")! as HTMLFormElement;
    await act(async () => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });

    expect(mockGenerate).toHaveBeenCalledTimes(1);
    expect(toastSuccess).toHaveBeenCalledWith("Commission generated");
    expect(toastError).not.toHaveBeenCalled();
    expect(routerRefresh).toHaveBeenCalled();
    cleanup();
  });

  it("shows an error toast when Generate fails", async () => {
    mockGenerate.mockRejectedValueOnce(new Error("No commission rate configured for X"));
    const { container, cleanup } = render([
      basePeriod({ id: "p-cur", total_revenue: 0, commission_amount: 0, balance_due: 0, status: "paid", generated: false }),
    ]);

    const btn = container.querySelector<HTMLButtonElement>(
      '[data-testid="store-commission-generate-p-cur"]',
    )!;
    const form = btn.closest("form")! as HTMLFormElement;
    await act(async () => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });

    expect(toastError).toHaveBeenCalledWith("No commission rate configured for X");
    expect(routerRefresh).not.toHaveBeenCalled();
    cleanup();
  });

  it("filters periods by search", () => {
    const { container, cleanup } = render([
      basePeriod({ id: "p-1", period_start: "2026-08-30", period_end: "2026-09-06" }),
      basePeriod({ id: "p-2", period_start: "2026-08-23", period_end: "2026-08-30" }),
    ]);
    const search = container.querySelector<HTMLInputElement>('[data-testid="store-commissions-search"]')!;
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      setter.call(search, "08-23");
      search.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(container.textContent).toMatch(/Commission Periods \(1\)/);
    expect(container.querySelector('[data-testid="store-commission-view-p-2"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="store-commission-view-p-1"]')).toBeNull();
    cleanup();
  });
});