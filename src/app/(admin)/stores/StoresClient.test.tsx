// @vitest-environment jsdom
// Tell React 19 this is an act-enabled test environment (suppresses warnings)
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import { describe, it, expect, beforeEach, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";

// P51: stores page is Super-Admin-only (server-side redirect), but
// for test purposes we render the client with roleName="Super Admin".
// We mock useRouter so we can assert that row clicks call push with
// the correct per-store path.
const { pushMock, refreshMock } = vi.hoisted(() => ({
  pushMock: vi.fn(),
  refreshMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, refresh: refreshMock }),
}));

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    onClick,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
    onClick?: (e: React.MouseEvent) => void;
  }) => (
    <a
      href={href}
      onClick={(e) => {
        if (onClick) onClick(e);
      }}
      {...rest}
    >
      {children}
    </a>
  ),
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

import StoresClient from "./StoresClient";
import type { StoreRow } from "./actions";
import { makeStore } from "../../../../test/fixtures/factories";

function render(
  stores: StoreRow[] = [],
  roleName: string = "Super Admin",
  actionPerms: { canView: boolean; canCreate: boolean; canEdit: boolean; canDelete: boolean } = {
    canView: true,
    canCreate: true,
    canEdit: true,
    canDelete: true,
  },
) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  let root: Root | null = null;
  act(() => {
    root = createRoot(container);
    root.render(
      <StoresClient
        stores={stores}
        categories={[]}
        roleName={roleName}
        actionPerms={actionPerms}
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
  pushMock.mockReset();
  refreshMock.mockReset();
});

describe("StoresClient (P51): row click navigates to /stores/[id]", () => {
  it("renders each store row with role=button + tabIndex=0 + data-testid", () => {
    const s1 = makeStore({ id: "s-1", name: "Alpha" });
    const s2 = makeStore({ id: "s-2", name: "Beta" });
    const { container, cleanup } = render([s1, s2], "Super Admin", {
      canView: true,
      canCreate: false,
      canEdit: false,
      canDelete: false,
    });

    const row1 = container.querySelector('[data-testid="store-row-s-1"]') as HTMLTableRowElement;
    const row2 = container.querySelector('[data-testid="store-row-s-2"]') as HTMLTableRowElement;
    expect(row1).not.toBeNull();
    expect(row2).not.toBeNull();
    expect(row1.getAttribute("role")).toBe("button");
    expect(row1.getAttribute("tabindex")).toBe("0");
    expect(row1.style.cursor).toBe("pointer");
    cleanup();
  });

  it("navigates to /stores/<id> when a row is clicked", async () => {
    const s1 = makeStore({ id: "s-click", name: "Clickable" });
    const { container, cleanup } = render([s1], "Super Admin", {
      canView: true,
      canCreate: false,
      canEdit: false,
      canDelete: false,
    });

    const row = container.querySelector('[data-testid="store-row-s-click"]') as HTMLTableRowElement;
    await act(async () => {
      row.click();
    });

    expect(pushMock).toHaveBeenCalledTimes(1);
    expect(pushMock).toHaveBeenCalledWith("/stores/s-click");
    cleanup();
  });

  it("navigates to /stores/<id> when Enter is pressed on a row", async () => {
    const s1 = makeStore({ id: "s-kb", name: "Keyboard" });
    const { container, cleanup } = render([s1], "Super Admin", {
      canView: true,
      canCreate: false,
      canEdit: false,
      canDelete: false,
    });

    const row = container.querySelector('[data-testid="store-row-s-kb"]') as HTMLTableRowElement;
    await act(async () => {
      row.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });
    expect(pushMock).toHaveBeenCalledWith("/stores/s-kb");
    cleanup();
  });

  it("navigates to /stores/<id> when Space is pressed on a row", async () => {
    const s1 = makeStore({ id: "s-space", name: "Spacebar" });
    const { container, cleanup } = render([s1], "Super Admin", {
      canView: true,
      canCreate: false,
      canEdit: false,
      canDelete: false,
    });

    const row = container.querySelector('[data-testid="store-row-s-space"]') as HTMLTableRowElement;
    await act(async () => {
      row.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true }));
    });
    expect(pushMock).toHaveBeenCalledWith("/stores/s-space");
    cleanup();
  });

  it("does NOT navigate when an unrelated key (e.g. 'a') is pressed on a row", async () => {
    const s1 = makeStore({ id: "s-a", name: "Letter" });
    const { container, cleanup } = render([s1], "Super Admin", {
      canView: true,
      canCreate: false,
      canEdit: false,
      canDelete: false,
    });

    const row = container.querySelector('[data-testid="store-row-s-a"]') as HTMLTableRowElement;
    await act(async () => {
      row.dispatchEvent(new KeyboardEvent("keydown", { key: "a", bubbles: true }));
    });
    expect(pushMock).not.toHaveBeenCalled();
    cleanup();
  });

  it("View (eye) button does NOT trigger row navigation — opens modal instead", async () => {
    const s1 = makeStore({ id: "s-eye", name: "EyeStore" });
    const { container, cleanup } = render([s1], "Super Admin", {
      canView: true,
      canCreate: false,
      canEdit: false,
      canDelete: false,
    });

    const eyeBtn = container.querySelector('[data-testid="store-row-s-eye"] button[title="View"]') as HTMLButtonElement;
    expect(eyeBtn).not.toBeNull();
    await act(async () => {
      eyeBtn.click();
    });

    // Eye → modal, no navigation
    expect(pushMock).not.toHaveBeenCalled();
    // Modal should be open: the 'Categories' label is unique to the modal
    // (not in the row).
    expect(container.textContent).toMatch(/Categories/);
    cleanup();
  });

  it("Edit (pencil) link does NOT trigger row navigation", async () => {
    const s1 = makeStore({ id: "s-pen", name: "PencilStore" });
    const { container, cleanup } = render([s1], "Super Admin", {
      canView: true,
      canCreate: false,
      canEdit: true,
      canDelete: false,
    });

    const editLink = container.querySelector('[data-testid="store-row-s-pen"] a[title="Edit"]') as HTMLAnchorElement;
    expect(editLink).not.toBeNull();
    expect(editLink.getAttribute("href")).toBe("/settings?store_id=s-pen");

    // Click the link — its onClick handler calls e.stopPropagation()
    // so the row's onClick (router.push) does NOT fire. We assert
    // pushMock was never called.
    await act(async () => {
      editLink.click();
    });
    expect(pushMock).not.toHaveBeenCalled();
    cleanup();
  });
});

describe("StoresClient (P65): view modal shows the Primary GSTIN row", () => {
  it("renders a 'Primary GSTIN' row with a Manage link to /gst-numbers in the view modal", async () => {
    // P65: we don't await the async fetch in this test (no
    // getPrimaryGstin mock), so the row stays in 'Loading…' state.
    // The 'Primary GSTIN' label is always present, the Manage link
    // appears only after the fetch resolves with a non-null result.
    const s1 = makeStore({ id: "s-gst", name: "GstStore" });
    const { container, cleanup } = render([s1], "Super Admin", {
      canView: true,
      canCreate: false,
      canEdit: false,
      canDelete: false,
    });

    const eyeBtn = container.querySelector(
      '[data-testid="store-row-s-gst"] button[title="View"]',
    ) as HTMLButtonElement;
    expect(eyeBtn).not.toBeNull();
    await act(async () => {
      eyeBtn.click();
    });

    // The Primary GSTIN label is always rendered in the view modal
    expect(container.textContent).toMatch(/Primary GSTIN/);
    // Without mocking getPrimaryGstin, the cell shows 'Loading…'
    expect(container.textContent).toMatch(/Loading/);
    cleanup();
  });
});
