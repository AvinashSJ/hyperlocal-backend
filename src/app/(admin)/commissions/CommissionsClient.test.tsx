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
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import CommissionsClient from "./CommissionsClient";
import type { CommissionStoreSummary } from "./actions";
import type { ActionPermissions } from "@/lib/require-permission";

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
});

function unmount() {
  if (root) act(() => root.unmount());
  container.remove();
}

function render(props: {
  stores?: CommissionStoreSummary[];
  actionPerms?: ActionPermissions;
} = {}) {
  act(() => {
    root = createRoot(container);
    root.render(
      <CommissionsClient stores={props.stores ?? []} actionPerms={props.actionPerms} />,
    );
  });
}

const sampleStore: CommissionStoreSummary = {
  id: "s-1",
  name: "FreshCart Downtown",
  code: "FCD",
  commission_rate: 10,
  period_count: 3,
  last_period_end: "2026-05-31",
  total_commission: 1250,
  total_paid: 500,
  total_balance: 750,
};

describe("CommissionsClient (P68): stores list with live aggregates", () => {
  it("renders the stores count in the header", () => {
    render({ stores: [sampleStore] });
    expect(container.textContent).toMatch(/Stores \(1\)/);
  });

  it("renders the store name and code in each row", () => {
    render({ stores: [sampleStore] });
    expect(container.textContent).toContain("FreshCart Downtown");
    expect(container.textContent).toContain("FCD");
  });

  it("renders the rate, periods count, and live aggregates", () => {
    render({ stores: [sampleStore] });
    expect(container.textContent).toMatch(/10%/);
    expect(container.textContent).toMatch(/1,250/);
    expect(container.textContent).toMatch(/500/);
    expect(container.textContent).toMatch(/750/);
  });

  it("highlights the balance in red when > 0 and green when 0", () => {
    render({
      stores: [
        sampleStore, // balance 750 (red)
        { ...sampleStore, id: "s-2", name: "PaidStore", code: "PD", total_balance: 0 },
      ],
    });
    // Find the row for each store
    const row1 = container.querySelector(`[data-testid="commission-store-row-s-1"]`);
    const row2 = container.querySelector(`[data-testid="commission-store-row-s-2"]`);
    expect(row1!.querySelector(".text-danger")?.textContent).toContain("750");
    expect(row2!.querySelector(".text-success")?.textContent).toContain("0");
  });

  it("renders a link to /commissions/store/[id] for each row", () => {
    render({ stores: [sampleStore] });
    const link = container.querySelector<HTMLAnchorElement>(
      '[data-testid="commission-store-view-s-1"]',
    );
    expect(link).toBeTruthy();
    expect(link!.getAttribute("href")).toBe("/commissions/store/s-1");
  });

  it("renders an empty-state row when there are no stores", () => {
    render({ stores: [] });
    expect(container.textContent).toContain("No stores found");
  });

  it("filters by name or code when searching", () => {
    render({
      stores: [
        sampleStore,
        { ...sampleStore, id: "s-2", name: "GreenMart", code: "GRM" },
      ],
    });
    const search = container.querySelector<HTMLInputElement>('[data-testid="commissions-search"]')!;
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      setter.call(search, "Green");
      search.dispatchEvent(new Event("input", { bubbles: true }));
    });
    // Only GreenMart should be visible now
    expect(container.textContent).toContain("GreenMart");
    expect(container.textContent).not.toContain("FreshCart Downtown");
  });
});
