// @vitest-environment node
// Tell React 19 this is an act-enabled test environment (suppresses warnings)
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderToString } from "react-dom/server";

vi.mock("@iconify/react", () => ({
  Icon: ({ icon, className }: { icon: string; className?: string }) =>
    `<span data-icon="${icon}" class="${className ?? ""}" />`,
}));

import ProductActivityLog from "./ProductActivityLog";
import type { ActivityLogWithUser } from "@/lib/activity-log";

beforeEach(() => {
  // Reset nothing — pure presentational component now
});

describe("ProductActivityLog", () => {
  it("renders the empty state when there are no entries", () => {
    const html = renderToString(<ProductActivityLog entries={[]} />);
    expect(html).toContain("Activity Log");
    expect(html).toContain("No activity recorded yet.");
    expect(html).toContain('data-testid="activity-log-empty"');
  });

  it("renders a list of entries with actor, action, and timestamp", () => {
    const entries: ActivityLogWithUser[] = [
      {
        id: 1,
        user_id: "u-1",
        action: "create",
        entity_type: "product",
        entity_id: "p-1",
        details: { name: "Widget" },
        created_at: "2026-06-19T10:00:00Z",
        profiles: [{ full_name: "Admin User" }],
      },
      {
        id: 2,
        user_id: "u-2",
        action: "update",
        entity_type: "product",
        entity_id: "p-1",
        details: { fields_received: ["mrp", "stock_quantity"] },
        created_at: "2026-06-19T11:00:00Z",
        profiles: [{ full_name: "Manager Mike" }],
      },
    ];

    const html = renderToString(<ProductActivityLog entries={entries} />);
    expect(html).toContain('data-testid="activity-log-list"');
    expect(html).toContain("Admin User");
    expect(html).toContain("Created");
    expect(html).toContain("Manager Mike");
    expect(html).toContain("Edited");
    expect(html).toContain("Name: Widget");
    expect(html).toContain("Fields touched: mrp, stock_quantity");
  });

  it("renders em dash for null/missing user name", () => {
    const entries: ActivityLogWithUser[] = [
      {
        id: 1,
        user_id: null,
        action: "bulk_import",
        entity_type: "product",
        entity_id: "p-1",
        details: { imported: 5, errors: 0 },
        created_at: "2026-06-19T10:00:00Z",
        profiles: null,
      },
    ];

    const html = renderToString(<ProductActivityLog entries={entries} />);
    expect(html).toMatch(/<strong[^>]*>—<\/strong>/);
    expect(html).toContain("Bulk import");
    expect(html).toContain("Imported: 5 · Errors: 0");
  });

  it("truncates the fields_received list to 5 and shows +N more", () => {
    const entries: ActivityLogWithUser[] = [
      {
        id: 1,
        user_id: "u-1",
        action: "update",
        entity_type: "product",
        entity_id: "p-1",
        details: { fields_received: ["a", "b", "c", "d", "e", "f", "g"] },
        created_at: "2026-06-19T10:00:00Z",
        profiles: [{ full_name: "Admin" }],
      },
    ];

    const html = renderToString(<ProductActivityLog entries={entries} />);
    expect(html).toContain("Fields touched: a, b, c, d, e, +2 more");
  });
});
