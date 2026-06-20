// @vitest-environment jsdom
// Tell React 19 this is an act-enabled test environment (suppresses warnings)
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import { describe, it, expect, beforeEach, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";

let mockUuidCounter = 0;
vi.mock("uuid", () => ({
  v4: () => `mocked-uuid-${++mockUuidCounter}`,
}));

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

vi.mock("react-toastify", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

const mocks = vi.hoisted(() => ({
  getProductActivityTrail: vi.fn(),
  deleteProduct: vi.fn(),
}));

vi.mock("./actions", () => ({
  deleteProduct: mocks.deleteProduct,
  getProductActivityTrail: mocks.getProductActivityTrail,
}));

import ProductsClient from "./ProductsClient";
import { toast } from "react-toastify";

type Product = {
  id: string;
  name: string;
  sku: string | null;
  category_id: string | null;
  brand: string | null;
  selling_price: number;
  mrp: number;
  stock_quantity: number;
  low_stock_threshold: number | null;
  status: string;
  categories: { name: string } | null;
};

const noopActionPerms = {
  canView: true,
  canCreate: false,
  canEdit: false,
  canDelete: true,
};

const emptyTrail = {
  orders: [],
  orderTracks: [],
  inventoryLog: [],
  summary: { orderCount: 0, totalUnitsSold: 0, totalRevenue: 0, inventoryEvents: 0 },
};

const productA: Product = {
  id: "p-a",
  name: "santoor 80g",
  sku: "SNT-80",
  category_id: null,
  brand: null,
  selling_price: 75,
  mrp: 80,
  stock_quantity: 100,
  low_stock_threshold: 10,
  status: "active",
  categories: null,
};

const populatedTrail = {
  orders: [
    {
      orderId: "o-1",
      orderNumber: "ORD-2026-000001",
      status: "delivered",
      placedAt: "2026-06-19T08:00:00.000Z",
      totalAmount: 150,
      customerName: "Alice",
      quantity: 2,
      unitPrice: 75,
      variantName: null,
    },
    {
      orderId: "o-2",
      orderNumber: "ORD-2026-000002",
      status: "cancelled",
      placedAt: "2026-06-19T09:00:00.000Z",
      totalAmount: 75,
      customerName: "Bob",
      quantity: 1,
      unitPrice: 75,
      variantName: null,
    },
  ],
  orderTracks: [],
  inventoryLog: [
    {
      id: "il-1",
      variantId: null,
      variantName: null,
      quantityChange: -2,
      runningBalance: 73,
      reasonCode: "sale",
      notes: "order placed",
      createdAt: "2026-06-19T08:00:00.000Z",
    },
  ],
  summary: { orderCount: 2, totalUnitsSold: 3, totalRevenue: 225, inventoryEvents: 1 },
};

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  vi.mocked(toast.success).mockClear();
  vi.mocked(toast.error).mockClear();
  mocks.getProductActivityTrail.mockReset();
  mocks.deleteProduct.mockReset();
  mocks.deleteProduct.mockResolvedValue(undefined);
  mockUuidCounter = 0;
});

function unmount() {
  if (root) {
    act(() => root.unmount());
  }
  container.remove();
}

describe("ProductsClient — delete product activity trail (P16 Feature B)", () => {
  it("when the product has no orders/inventory events, the simple confirmation modal is shown", async () => {
    let resolveTrail: (value: typeof emptyTrail) => void = () => {};
    mocks.getProductActivityTrail.mockImplementation(
      () => new Promise<typeof emptyTrail>((res) => { resolveTrail = res; }),
    );

    act(() => {
      root = createRoot(container);
      root.render(
        <ProductsClient
          products={[productA]}
          categories={[]}
          actionPerms={noopActionPerms}
        />,
      );
    });

    const deleteBtn = container.querySelector(
      '[data-testid="delete-product-p-a"]',
    ) as HTMLButtonElement;
    expect(deleteBtn).toBeTruthy();

    act(() => {
      deleteBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    // Modal appears in loading state
    expect(container.querySelector('[data-testid="product-delete-modal"]')).toBeTruthy();
    expect(container.textContent).toContain("Loading activity trail");

    // Resolve the trail as empty
    await act(async () => {
      resolveTrail(emptyTrail);
    });

    // Modal now shows the simple confirmation
    expect(container.textContent).toContain("Are you sure you want to delete");
    expect(container.textContent).toContain("santoor 80g");
    expect(container.textContent).toContain("no associated orders or inventory events");
    // Trail-mode markers should NOT be present
    expect(container.querySelector('[data-testid="product-delete-trail-summary"]')).toBeFalsy();
    expect(container.querySelector('[data-testid="product-delete-trail-orders"]')).toBeFalsy();

    unmount();
  });

  it("when the product HAS orders/inventory events, the detailed trail modal is shown", async () => {
    let resolveTrail: (value: typeof populatedTrail) => void = () => {};
    mocks.getProductActivityTrail.mockImplementation(
      () => new Promise<typeof populatedTrail>((res) => { resolveTrail = res; }),
    );

    act(() => {
      root = createRoot(container);
      root.render(
        <ProductsClient
          products={[productA]}
          categories={[]}
          actionPerms={noopActionPerms}
        />,
      );
    });

    const deleteBtn = container.querySelector(
      '[data-testid="delete-product-p-a"]',
    ) as HTMLButtonElement;
    act(() => {
      deleteBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    await act(async () => {
      resolveTrail(populatedTrail);
    });

    // Trail summary visible
    const summary = container.querySelector(
      '[data-testid="product-delete-trail-summary"]',
    );
    expect(summary).toBeTruthy();
    expect(summary!.textContent).toContain("2 order(s)");
    expect(summary!.textContent).toContain("3 units sold");
    expect(summary!.textContent).toContain("₹225");
    expect(summary!.textContent).toContain("1 inventory event");

    // Orders table visible
    const ordersTable = container.querySelector(
      '[data-testid="product-delete-trail-orders"]',
    );
    expect(ordersTable).toBeTruthy();
    expect(ordersTable!.textContent).toContain("ORD-2026-000001");
    expect(ordersTable!.textContent).toContain("Alice");
    expect(ordersTable!.textContent).toContain("ORD-2026-000002");
    expect(ordersTable!.textContent).toContain("Bob");
    expect(ordersTable!.textContent).toContain("delivered");
    expect(ordersTable!.textContent).toContain("cancelled");

    // Inventory log table visible
    const invTable = container.querySelector(
      '[data-testid="product-delete-trail-inventory"]',
    );
    expect(invTable).toBeTruthy();
    expect(invTable!.textContent).toContain("sale");
    expect(invTable!.textContent).toContain("order placed");
    expect(invTable!.textContent).toContain("-2");

    // Simple confirmation text NOT shown
    expect(container.textContent).not.toContain("Are you sure you want to delete");

    unmount();
  });

  it("clicking 'Delete product' in the trail modal calls deleteProduct and dismisses", async () => {
    mocks.getProductActivityTrail.mockResolvedValue(populatedTrail);

    act(() => {
      root = createRoot(container);
      root.render(
        <ProductsClient
          products={[productA]}
          categories={[]}
          actionPerms={noopActionPerms}
        />,
      );
    });

    act(() => {
      const deleteBtn = container.querySelector(
        '[data-testid="delete-product-p-a"]',
      ) as HTMLButtonElement;
      deleteBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    // Wait for trail to resolve and modal to update
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const confirmBtn = container.querySelector(
      '[data-testid="product-delete-confirm"]',
    ) as HTMLButtonElement;
    expect(confirmBtn).toBeTruthy();
    expect(confirmBtn.textContent).toContain("Delete product");
    expect(confirmBtn.disabled).toBe(false);

    await act(async () => {
      confirmBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    expect(mocks.deleteProduct).toHaveBeenCalledTimes(1);
    expect(mocks.deleteProduct).toHaveBeenCalledWith("p-a");
    expect(toast.success).toHaveBeenCalledWith("Product deleted");

    // Modal dismissed
    expect(container.querySelector('[data-testid="product-delete-modal"]')).toBeFalsy();

    unmount();
  });
});

describe("ProductsClient — Download CSV button (P22 Feature)", () => {
  const createActionPerms = {
    canView: true,
    canCreate: true,
    canEdit: false,
    canDelete: false,
  };

  it("renders a Download CSV link pointing to the export API route when canCreate is true", async () => {
    act(() => {
      root = createRoot(container);
      root.render(
        <ProductsClient
          products={[]}
          categories={[]}
          actionPerms={createActionPerms}
        />,
      );
    });

    const link = container.querySelector(
      '[data-testid="download-csv"]',
    ) as HTMLAnchorElement;
    expect(link).toBeTruthy();
    expect(link.tagName).toBe("A");
    expect(link.getAttribute("href")).toBe("/api/admin/products/export");
    // `download` attribute present (browser handles the file save)
    expect(link.hasAttribute("download")).toBe(true);
    expect(link.textContent).toContain("Download CSV");

    unmount();
  });

  it("does NOT render the Download CSV button when canCreate is false", async () => {
    act(() => {
      root = createRoot(container);
      root.render(
        <ProductsClient
          products={[]}
          categories={[]}
          actionPerms={noopActionPerms}
        />,
      );
    });

    expect(container.querySelector('[data-testid="download-csv"]')).toBeFalsy();
    // Import button is also gated by canCreate, so it should be missing too
    expect(container.querySelector('[data-testid="import-csv"]')).toBeFalsy();

    unmount();
  });
});
