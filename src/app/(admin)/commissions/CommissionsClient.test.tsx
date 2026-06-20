// @vitest-environment jsdom
// Tell React 19 this is an act-enabled test environment (suppresses warnings)
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import { describe, it, expect, beforeEach, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";

vi.mock("@iconify/react", () => ({
  Icon: ({ icon, className }: { icon: string; className?: string }) =>
    `<span data-icon="${icon}" class="${className ?? ""}" />`,
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) =>
    `<a href="${href}" ${Object.entries(rest).map(([k, v]) => `${k}="${v}"`).join(" ")}>${typeof children === "string" ? children : ""}</a>`,
}));

const { generateCommissionMock, generateAllCommissionsMock } = vi.hoisted(() => ({
  generateCommissionMock: vi.fn(),
  generateAllCommissionsMock: vi.fn(),
}));

vi.mock("./actions", () => ({
  generateCommission: generateCommissionMock,
  generateAllCommissions: generateAllCommissionsMock,
}));

const { useRouterMock, refreshMock } = vi.hoisted(() => ({
  useRouterMock: vi.fn(),
  refreshMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: refreshMock }),
}));

import CommissionsClient from "./CommissionsClient";

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  generateCommissionMock.mockReset();
  generateAllCommissionsMock.mockReset();
  refreshMock.mockReset();
});

function unmount() {
  if (root) act(() => root.unmount());
  container.remove();
}

function render(props: Partial<React.ComponentProps<typeof CommissionsClient>> = {}) {
  act(() => {
    root = createRoot(container);
    root.render(
      <CommissionsClient
        commissions={props.commissions ?? []}
        stores={props.stores ?? []}
        storeId={props.storeId ?? null}
        actionPerms={props.actionPerms}
      />,
    );
  });
}

const sampleCommission = {
  id: "c-1",
  store_id: "s-1",
  store_name: "Test Store",
  period_start: "2025-01-01",
  period_end: "2025-01-31",
  total_revenue: 10000,
  commission_rate: 10,
  commission_amount: 1000,
  balance_due: 1000,
  status: "unpaid" as const,
  notes: null,
  created_at: "2025-02-01T10:30:00.000Z",
  payment_count: 0,
};

describe("CommissionsClient — P27: Generated date column", () => {
  it("renders the 'Generated' column header", () => {
    render({ commissions: [sampleCommission] });
    expect(container.textContent).toContain("Generated");
  });

  it("formats the created_at as date+time in the row", () => {
    render({ commissions: [sampleCommission] });
    // The date 2025-02-01T10:30:00.000Z should be formatted by the
    // en-IN locale as "1 Feb 2025, 10:30 AM" (or similar — exact text
    // depends on the runtime's Intl support, so just check the time is there).
    const cells = Array.from(container.querySelectorAll("td"));
    const generatedCell = cells.find((c) => /\d{2}:\d{2}/.test(c.textContent ?? ""));
    expect(generatedCell).toBeTruthy();
    expect(generatedCell!.textContent).toMatch(/Feb.*2025|2025.*Feb/);
  });

  it("renders an empty-state row spanning all 10 columns when no commissions", () => {
    render({ commissions: [] });
    const cells = container.querySelectorAll("td");
    const empty = Array.from(cells).find((c) => c.textContent === "No commissions found");
    expect(empty).toBeTruthy();
    expect(empty!.getAttribute("colspan")).toBe("10");
  });
});

describe("CommissionsClient — P27: Generate All button", () => {
  it("renders a 'Generate All' button when canCreate is true", () => {
    render({ actionPerms: { canView: true, canCreate: true, canEdit: true, canDelete: true } });
    const btn = container.querySelector('[data-testid="generate-all-btn"]');
    expect(btn).toBeTruthy();
  });

  it("does NOT render a 'Generate All' button when canCreate is false", () => {
    render({ actionPerms: { canView: true, canCreate: false, canEdit: false, canDelete: false } });
    const btn = container.querySelector('[data-testid="generate-all-btn"]');
    expect(btn).toBeFalsy();
  });

  it("calls generateAllCommissions when the form is submitted and shows the summary", async () => {
    generateAllCommissionsMock.mockResolvedValue({
      generated: 3,
      skipped: 1,
      total_stores: 4,
      errors: [{ store_id: "s-2", store_name: "No Rate Store", message: "No commission rate" }],
    });
    render({ actionPerms: { canView: true, canCreate: true, canEdit: true, canDelete: true } });

    // Open the modal
    const openBtn = container.querySelector<HTMLButtonElement>('[data-testid="generate-all-btn"]')!;
    await act(async () => { openBtn.click(); });

    // Fill the form
    const form = container.querySelector<HTMLFormElement>('form[action]')!;
    const dateInputs = form.querySelectorAll<HTMLInputElement>('input[type="date"]');
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      setter.call(dateInputs[0], "2025-01-01");
      setter.call(dateInputs[1], "2025-01-31");
    });
    form.querySelector<HTMLTextAreaElement>("textarea[name=notes]")!.value = "Monthly batch";

    // Submit
    await act(async () => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });

    expect(generateAllCommissionsMock).toHaveBeenCalledTimes(1);
    const calledWith = generateAllCommissionsMock.mock.calls[0][0] as FormData;
    expect(calledWith.get("period_start")).toBe("2025-01-01");
    expect(calledWith.get("period_end")).toBe("2025-01-31");
    expect(calledWith.get("notes")).toBe("Monthly batch");

    // The summary should now be visible
    const summary = container.querySelector('[data-testid="generate-all-summary"]');
    expect(summary).toBeTruthy();
    expect(summary!.textContent).toContain("Generated:");
    expect(summary!.textContent).toContain("3");
    expect(summary!.textContent).toContain("Skipped:");
    expect(summary!.textContent).toContain("No Rate Store");

    unmount();
  });
});
