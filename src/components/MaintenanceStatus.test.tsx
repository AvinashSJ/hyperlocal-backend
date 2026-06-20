// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { act } from "react";
import type { ReactNode } from "react";

vi.mock("next/navigation", () => ({
  useRouter: vi.fn(() => ({
    push: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
  })),
  usePathname: vi.fn(() => "/"),
  useSearchParams: vi.fn(() => new URLSearchParams()),
  useParams: vi.fn(() => ({})),
  redirect: vi.fn(),
  notFound: vi.fn(),
}));

vi.mock("@iconify/react", () => ({
  Icon: ({ icon, width, className }: { icon: string; width?: number; className?: string }) => (
    <span data-icon={icon} data-width={width} className={className} />
  ),
}));

// Mock the server actions + the runServerAction helper so the toggle
// doesn't actually hit the network.
const mockRunServerAction = vi.fn();

vi.mock("@/app/(admin)/settings/actions", () => ({
  updateAppMaintenance: vi.fn(),
  updateStoreMaintenance: vi.fn(),
}));
vi.mock("@/lib/run-server-action", () => ({
  runServerAction: (...args: unknown[]) => mockRunServerAction(...args),
}));

import MaintenanceStatus from "./MaintenanceStatus";

type RootLike = { render: (n: ReactNode) => void; unmount: () => void };

const baseApp = {
  enabled: false,
  reason: "maintenance" as const,
  message: "",
  etaHours: null,
};
const baseStore = {
  enabled: false,
  reason: "maintenance" as const,
  message: "",
  etaHours: null,
};

beforeEach(() => {
  mockRunServerAction.mockReset();
  // Default: success
  mockRunServerAction.mockResolvedValue({ ok: true });
});

describe("MaintenanceStatus — switch-slider pill rendering (P35)", () => {
  it("renders the App pill when isSuperAdmin=true", () => {
    const html = renderToString(
      <MaintenanceStatus
        isSuperAdmin
        isStoreScoped={false}
        app={baseApp}
        store={baseStore}
        storeId={null}
      />,
    );
    expect(html).toContain('data-testid="app-maintenance-pill"');
    // Switch-slider styling: a form-switch form-check class
    expect(html).toContain("form-check-input");
    // Label text reflects the state (React injects <!-- --> between
    // adjacent expressions in SSR)
    expect(html).toMatch(/App:[\s\S]*?Online/);
  });

  it("does NOT render the App pill when isSuperAdmin=false", () => {
    const html = renderToString(
      <MaintenanceStatus
        isSuperAdmin={false}
        isStoreScoped
        app={baseApp}
        store={baseStore}
        storeId="s-1"
      />,
    );
    expect(html).not.toContain('data-testid="app-maintenance-pill"');
  });

  it("renders the Store pill when isStoreScoped=true with a storeId", () => {
    const html = renderToString(
      <MaintenanceStatus
        isSuperAdmin={false}
        isStoreScoped
        app={baseApp}
        store={baseStore}
        storeId="s-1"
      />,
    );
    expect(html).toContain('data-testid="store-maintenance-pill"');
    expect(html).toMatch(/Store:[\s\S]*?Open/);
  });

  it("does NOT render the Store pill when storeId is missing", () => {
    const html = renderToString(
      <MaintenanceStatus
        isSuperAdmin={false}
        isStoreScoped
        app={baseApp}
        store={baseStore}
        storeId={null}
      />,
    );
    expect(html).not.toContain('data-testid="store-maintenance-pill"');
  });

  it("App pill shows 'Maintenance' label when app.enabled=true", () => {
    const html = renderToString(
      <MaintenanceStatus
        isSuperAdmin
        isStoreScoped={false}
        app={{ ...baseApp, enabled: true }}
        store={baseStore}
        storeId={null}
      />,
    );
    expect(html).toMatch(/App:[\s\S]*?Maintenance/);
  });

  it("Store pill shows 'Closed' label when store.enabled=true", () => {
    const html = renderToString(
      <MaintenanceStatus
        isSuperAdmin={false}
        isStoreScoped
        app={baseApp}
        store={{ ...baseStore, enabled: true }}
        storeId="s-1"
      />,
    );
    expect(html).toMatch(/Store:[\s\S]*?Closed/);
  });
});

describe("MaintenanceStatus — switch-slider click behavior (P35)", () => {
  it("clicking the App pill calls runServerAction and opens the popover", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);

    let root: RootLike | null = null;
    await act(async () => {
      const { createRoot } = await import("react-dom/client");
      root = createRoot(container) as unknown as RootLike;
      root.render(
        <MaintenanceStatus
          isSuperAdmin
          isStoreScoped={false}
          app={baseApp}
          store={baseStore}
          storeId={null}
        />,
      );
    });

    const pill = container.querySelector(
      '[data-testid="app-maintenance-pill"]',
    ) as HTMLButtonElement;
    expect(pill).toBeTruthy();

    await act(async () => {
      pill.click();
    });

    // The action was called
    expect(mockRunServerAction).toHaveBeenCalledTimes(1);
    expect(typeof mockRunServerAction.mock.calls[0][0]).toBe("function");
    expect(mockRunServerAction.mock.calls[0][1]).toBeInstanceOf(FormData);

    // The popover is now open
    expect(
      container.querySelector('[data-testid="app-maintenance-save"]'),
    ).toBeTruthy();

    // The popover's switch is interactive (not read-only)
    const popoverSwitch = container.querySelector(
      'input[type="checkbox"][role="switch"]#app-enabled',
    ) as HTMLInputElement;
    expect(popoverSwitch).toBeTruthy();
    expect(popoverSwitch.hasAttribute("readonly")).toBe(false);

    container.remove();
    // root.unmount() not called — see the note in the ImagePickerModal test.
  });

  it("clicking the Store pill calls runServerAction and opens the popover", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);

    let root: RootLike | null = null;
    await act(async () => {
      const { createRoot } = await import("react-dom/client");
      root = createRoot(container) as unknown as RootLike;
      root.render(
        <MaintenanceStatus
          isSuperAdmin={false}
          isStoreScoped
          app={baseApp}
          store={baseStore}
          storeId="s-1"
        />,
      );
    });

    const pill = container.querySelector(
      '[data-testid="store-maintenance-pill"]',
    ) as HTMLButtonElement;
    expect(pill).toBeTruthy();

    await act(async () => {
      pill.click();
    });

    expect(mockRunServerAction).toHaveBeenCalledTimes(1);
    expect(typeof mockRunServerAction.mock.calls[0][0]).toBe("function");
    expect(mockRunServerAction.mock.calls[0][1]).toBeInstanceOf(FormData);

    // The popover is open
    expect(
      container.querySelector('[data-testid="store-maintenance-save"]'),
    ).toBeTruthy();

    container.remove();
    // root.unmount() not called.
  });

  it("rolls back the optimistic toggle when the server returns an error", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);

    mockRunServerAction.mockResolvedValueOnce({
      ok: false,
      error: { message: "server error" },
    });

    let root: RootLike | null = null;
    await act(async () => {
      const { createRoot } = await import("react-dom/client");
      root = createRoot(container) as unknown as RootLike;
      root.render(
        <MaintenanceStatus
          isSuperAdmin
          isStoreScoped={false}
          app={baseApp}
          store={baseStore}
          storeId={null}
        />,
      );
    });

    const pill = container.querySelector(
      '[data-testid="app-maintenance-pill"]',
    ) as HTMLButtonElement;

    await act(async () => {
      pill.click();
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    // The popover still shows the error
    expect(container.textContent).toMatch(/server error/);

    // The optimistic toggle rolled back: the switch in the popover
    // should now be unchecked (the original state).
    const popoverSwitch = container.querySelector(
      'input[type="checkbox"][role="switch"]#app-enabled',
    ) as HTMLInputElement;
    expect(popoverSwitch.checked).toBe(false);

    container.remove();
    // root.unmount() not called.
  });

  it("clicking the popover's switch toggles without re-opening", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);

    let root: RootLike | null = null;
    await act(async () => {
      const { createRoot } = await import("react-dom/client");
      root = createRoot(container) as unknown as RootLike;
      root.render(
        <MaintenanceStatus
          isSuperAdmin
          isStoreScoped={false}
          app={baseApp}
          store={baseStore}
          storeId={null}
        />,
      );
    });

    // Open the popover via the navbar pill
    const pill = container.querySelector(
      '[data-testid="app-maintenance-pill"]',
    ) as HTMLButtonElement;
    await act(async () => {
      pill.click();
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    // Clear the call history
    mockRunServerAction.mockClear();

    // Click the popover's switch
    const popoverSwitch = container.querySelector(
      'input[type="checkbox"][role="switch"]#app-enabled',
    ) as HTMLInputElement;
    await act(async () => {
      popoverSwitch.click();
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    // The action was called again (toggle from popover)
    expect(mockRunServerAction).toHaveBeenCalledTimes(1);

    // The popover is still open
    expect(
      container.querySelector('[data-testid="app-maintenance-save"]'),
    ).toBeTruthy();

    container.remove();
    // root.unmount() not called.
  });

  it("click-outside closes the popover", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);

    let root: RootLike | null = null;
    await act(async () => {
      const { createRoot } = await import("react-dom/client");
      root = createRoot(container) as unknown as RootLike;
      root.render(
        <MaintenanceStatus
          isSuperAdmin
          isStoreScoped={false}
          app={baseApp}
          store={baseStore}
          storeId={null}
        />,
      );
    });

    const pill = container.querySelector(
      '[data-testid="app-maintenance-pill"]',
    ) as HTMLButtonElement;
    await act(async () => {
      pill.click();
    });
    expect(
      container.querySelector('[data-testid="app-maintenance-save"]'),
    ).toBeTruthy();

    // Click outside
    await act(async () => {
      document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    });
    expect(
      container.querySelector('[data-testid="app-maintenance-save"]'),
    ).toBeFalsy();

    container.remove();
    // root.unmount() not called.
  });
});
