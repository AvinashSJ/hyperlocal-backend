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

// Mock react-toastify so toasts don't blow up in jsdom
vi.mock("react-toastify", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

// Mock the server action module. The actual getStoreProductsForCategory
// is exercised separately in actions.test.ts. The CategoriesClient test
// only cares about the UI behavior driven by the action's return value.
const mockGetStoreProducts = vi.fn();
// P61: mock deleteProduct for the per-product Delete button tests.
// The real deleteProduct action cascades to variants + images and
// writes an activity_log entry; those are covered in products/actions.test.ts.
// Here we only assert that the UI calls it with the right product id
// and reacts correctly to success/error.
const mockDeleteProduct = vi.fn();
vi.mock("../products/actions", () => ({
  deleteProduct: (...args: unknown[]) => mockDeleteProduct(...args),
}));

vi.mock("./actions", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./actions")>();
  return {
    ...actual,
    getStoreProductsForCategory: (...args: unknown[]) => mockGetStoreProducts(...args),
  };
});

import CategoriesClient from "./CategoriesClient";
import type { StoreProductsResult } from "./actions";

type Category = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  image_url: string | null;
  parent_id: string | null;
  is_featured: boolean;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  pending_deletion_at: string | null;
  parent_name?: string | null;
  product_count: number;
  stores: string[];
  effective_stores: string[];
  stores_inherited: boolean;
  children_count: number;
};

const baseCategory = (overrides: Partial<Category> = {}): Category => ({
  id: "c-1",
  name: "Fresh Fruits",
  slug: "fresh-fruits",
  description: null,
  image_url: null,
  parent_id: null,
  is_featured: false,
  sort_order: 0,
  is_active: true,
  created_at: "2026-01-01T00:00:00.000Z",
  pending_deletion_at: null,
  parent_name: null,
  product_count: 5,
  stores: [],
  effective_stores: ["FreshCart"],
  stores_inherited: false,
  children_count: 0,
  ...overrides,
});

const noopResult: StoreProductsResult = {
  products: [],
  total: 0,
  page: 1,
  pageSize: 10,
  totalPages: 0,
};

const sampleResult = (overrides: Partial<StoreProductsResult> = {}): StoreProductsResult => ({
  products: [
    {
      id: "p-1",
      name: "Apple",
      sku: "A-1",
      status: "active",
      store_id: "s-1",
      stores: { name: "FreshCart", code: "FRESH01" },
    },
    {
      id: "p-2",
      name: "Banana",
      sku: "B-1",
      status: "out_of_stock",
      store_id: "s-2",
      stores: { name: "DailyMart", code: "DAILY01" },
    },
  ],
  total: 2,
  page: 1,
  pageSize: 10,
  totalPages: 1,
  ...overrides,
});

function render(categories: Category[], isSuperAdmin = true) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  let root: Root | null = null;
  act(() => {
    root = createRoot(container);
    root.render(
      <CategoriesClient categories={categories} isSuperAdmin={isSuperAdmin} />,
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
  mockGetStoreProducts.mockReset();
  mockGetStoreProducts.mockResolvedValue(noopResult);
  mockDeleteProduct.mockReset();
  mockDeleteProduct.mockResolvedValue(undefined);
  // Default window.confirm to true (operator confirms). Tests
  // that exercise the cancel path override per-test.
  vi.spyOn(window, "confirm").mockReturnValue(true);
});

describe("CategoriesClient — P45 Super Admin products drill-down", () => {
  it("renders the Products badge as a button for Super Admin when count > 0", () => {
    const { container, cleanup } = render([baseCategory()], true);
    const btn = container.querySelector('[data-testid="category-products-btn-c-1"]');
    expect(btn).not.toBeNull();
    expect(btn?.textContent).toMatch(/5/);
    cleanup();
  });

  it("renders the Products badge as a static span for non-Super-Admin", () => {
    const { container, cleanup } = render([baseCategory()], false);
    const btn = container.querySelector('[data-testid="category-products-btn-c-1"]');
    expect(btn).toBeNull();
    // The plain span is still present with the count
    expect(container.textContent).toMatch(/5/);
    cleanup();
  });

  it("renders a static span (not a button) when product_count is 0 even for Super Admin", () => {
    const { container, cleanup } = render(
      [baseCategory({ product_count: 0 })],
      true,
    );
    const btn = container.querySelector('[data-testid="category-products-btn-c-1"]');
    expect(btn).toBeNull();
    cleanup();
  });

  it("clicking the badge calls getStoreProductsForCategory and shows the inline panel", async () => {
    mockGetStoreProducts.mockResolvedValueOnce(sampleResult());
    const { container, cleanup } = render([baseCategory()], true);

    const btn = container.querySelector<HTMLButtonElement>(
      '[data-testid="category-products-btn-c-1"]',
    )!;
    expect(btn).toBeTruthy();

    await act(async () => {
      btn.click();
    });

    expect(mockGetStoreProducts).toHaveBeenCalledWith("c-1", 1, 10, "");

    const panel = container.querySelector('[data-testid="category-products-row-c-1"]');
    expect(panel).not.toBeNull();
    expect(panel?.textContent).toMatch(/Apple/);
    expect(panel?.textContent).toMatch(/Banana/);
    expect(panel?.textContent).toMatch(/FreshCart/);
    expect(panel?.textContent).toMatch(/FRESH01/);
    cleanup();
  });

  it("renders the empty state when the action returns no products", async () => {
    mockGetStoreProducts.mockResolvedValueOnce({
      products: [],
      total: 0,
      page: 1,
      pageSize: 10,
      totalPages: 0,
    });
    const { container, cleanup } = render([baseCategory()], true);

    const btn = container.querySelector<HTMLButtonElement>(
      '[data-testid="category-products-btn-c-1"]',
    )!;
    await act(async () => {
      btn.click();
    });

    const empty = container.querySelector('[data-testid="category-products-empty-c-1"]');
    expect(empty?.textContent).toMatch(/No products with a store/);
    cleanup();
  });

  it("renders the error state when the action throws", async () => {
    // runServerAction catches the rejection and returns {ok:false, error}.
    // The client should render the error banner in the panel.
    mockGetStoreProducts.mockRejectedValueOnce(new Error("boom"));
    const { container, cleanup } = render([baseCategory()], true);

    const btn = container.querySelector<HTMLButtonElement>(
      '[data-testid="category-products-btn-c-1"]',
    )!;
    await act(async () => {
      btn.click();
    });

    // The action threw, so the error from runServerAction should be shown
    const errEl = container.querySelector('[data-testid="category-products-error-c-1"]');
    expect(errEl).not.toBeNull();
    expect(errEl?.textContent).toMatch(/boom/);
    cleanup();
  });

  it("clicking the badge again collapses the panel", async () => {
    mockGetStoreProducts.mockResolvedValueOnce(sampleResult());
    const { container, cleanup } = render([baseCategory()], true);

    const btn = container.querySelector<HTMLButtonElement>(
      '[data-testid="category-products-btn-c-1"]',
    )!;

    await act(async () => {
      btn.click();
    });
    expect(container.querySelector('[data-testid="category-products-row-c-1"]')).not.toBeNull();

    await act(async () => {
      btn.click();
    });
    expect(container.querySelector('[data-testid="category-products-row-c-1"]')).toBeNull();
    cleanup();
  });

  it("shows the search input and pagination when there are multiple pages", async () => {
    mockGetStoreProducts.mockResolvedValueOnce(
      sampleResult({ total: 25, totalPages: 3 }),
    );
    const { container, cleanup } = render([baseCategory()], true);

    const btn = container.querySelector<HTMLButtonElement>(
      '[data-testid="category-products-btn-c-1"]',
    )!;
    await act(async () => {
      btn.click();
    });

    expect(
      container.querySelector('[data-testid="category-products-search-c-1"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-testid="category-products-prev-c-1"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-testid="category-products-next-c-1"]'),
    ).not.toBeNull();
    expect(container.textContent).toMatch(/Page 1 of 3/);
    cleanup();
  });

  it("does not render pagination controls when totalPages is 1", async () => {
    mockGetStoreProducts.mockResolvedValueOnce(sampleResult({ total: 2, totalPages: 1 }));
    const { container, cleanup } = render([baseCategory()], true);

    const btn = container.querySelector<HTMLButtonElement>(
      '[data-testid="category-products-btn-c-1"]',
    )!;
    await act(async () => {
      btn.click();
    });

    expect(
      container.querySelector('[data-testid="category-products-prev-c-1"]'),
    ).toBeNull();
    expect(
      container.querySelector('[data-testid="category-products-next-c-1"]'),
    ).toBeNull();
    cleanup();
  });

  it("clicking Next calls the action with page+1", async () => {
    mockGetStoreProducts.mockResolvedValueOnce(
      sampleResult({ total: 25, totalPages: 3 }),
    );
    const { container, cleanup } = render([baseCategory()], true);

    const btn = container.querySelector<HTMLButtonElement>(
      '[data-testid="category-products-btn-c-1"]',
    )!;
    await act(async () => {
      btn.click();
    });

    // Reset the call history so we only assert the Next click
    mockGetStoreProducts.mockClear();
    mockGetStoreProducts.mockResolvedValueOnce(sampleResult({ page: 2 }));

    const nextBtn = container.querySelector<HTMLButtonElement>(
      '[data-testid="category-products-next-c-1"]',
    )!;
    await act(async () => {
      nextBtn.click();
    });

    expect(mockGetStoreProducts).toHaveBeenCalledWith("c-1", 2, 10, "");
    cleanup();
  });

  it("typing in the search input debounces a re-fetch with the new search", async () => {
    mockGetStoreProducts.mockResolvedValueOnce(sampleResult());
    const { container, cleanup } = render([baseCategory()], true);

    const btn = container.querySelector<HTMLButtonElement>(
      '[data-testid="category-products-btn-c-1"]',
    )!;
    await act(async () => {
      btn.click();
    });

    mockGetStoreProducts.mockClear();
    mockGetStoreProducts.mockResolvedValueOnce(sampleResult({ total: 1 }));

    const search = container.querySelector<HTMLInputElement>(
      '[data-testid="category-products-search-c-1"]',
    )!;
    await act(async () => {
      // Simulate the user typing
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value",
      )?.set;
      nativeInputValueSetter?.call(search, "apple");
      search.dispatchEvent(new Event("input", { bubbles: true }));
    });

    // The debounce is 300ms; advance time and let the timer fire
    await act(async () => {
      await new Promise((r) => setTimeout(r, 350));
    });

    expect(mockGetStoreProducts).toHaveBeenCalled();
    const lastCall = mockGetStoreProducts.mock.calls[
      mockGetStoreProducts.mock.calls.length - 1
    ] as unknown[];
    expect(lastCall[0]).toBe("c-1");
    expect(lastCall[1]).toBe(1); // page reset to 1
    expect(lastCall[3]).toBe("apple");
    cleanup();
  });
});

// -----------------------------------------------------------------
// P61: per-product Delete on the products drill-down panel
// -----------------------------------------------------------------
// Super Admin can remove a product from the system when it
// conflicts with the same product in another store (house rule:
// no two stores serve the same product in the same category tree).
// The button lives inside the P45 inline panel (visible after
// clicking the Products badge) and reuses the existing
// deleteProduct action from the products module.

async function expandPanelAndReturn(
  container: HTMLElement,
  categoryId: string,
  products: StoreProductsResult,
) {
  mockGetStoreProducts.mockResolvedValue(products);
  await act(async () => {
    (container.querySelector(`[data-testid="category-products-btn-${categoryId}"]`) as HTMLButtonElement).click();
  });
}

describe("CategoriesClient — P61 per-product Delete on the products panel", () => {
  it("renders a Delete button on each product row when the panel is open for Super Admin", async () => {
    const { container, cleanup } = render([baseCategory()], true);
    await expandPanelAndReturn(container, "c-1", sampleResult());

    const del1 = container.querySelector('[data-testid="category-product-delete-p-1"]');
    const del2 = container.querySelector('[data-testid="category-product-delete-p-2"]');
    expect(del1).not.toBeNull();
    expect(del2).not.toBeNull();
    // Header has a 5th "Actions" column
    const headers = container.querySelectorAll(
      '[data-testid="category-products-row-c-1"] thead th',
    );
    expect(headers.length).toBe(5);
    expect(headers[4]?.textContent).toMatch(/Actions/);
    cleanup();
  });

  it("clicking Delete calls window.confirm first; on confirm calls deleteProduct with the product id", async () => {
    const { container, cleanup } = render([baseCategory()], true);
    await expandPanelAndReturn(container, "c-1", sampleResult());
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    mockDeleteProduct.mockResolvedValue(undefined);

    await act(async () => {
      (container.querySelector('[data-testid="category-product-delete-p-1"]') as HTMLButtonElement).click();
    });

    expect(confirmSpy).toHaveBeenCalled();
    const msg = confirmSpy.mock.calls[0][0] as string;
    expect(msg).toMatch(/Delete/);
    expect(msg).toMatch(/Apple/);

    expect(mockDeleteProduct).toHaveBeenCalledWith("p-1");
    cleanup();
  });

  it("does NOT call deleteProduct if the operator cancels the confirm prompt", async () => {
    const { container, cleanup } = render([baseCategory()], true);
    await expandPanelAndReturn(container, "c-1", sampleResult());
    vi.spyOn(window, "confirm").mockReturnValue(false);

    await act(async () => {
      (container.querySelector('[data-testid="category-product-delete-p-1"]') as HTMLButtonElement).click();
    });

    expect(mockDeleteProduct).not.toHaveBeenCalled();
    cleanup();
  });

  it("on successful delete: toast.success + re-fetches the current page so the row disappears", async () => {
    const { container, cleanup } = render([baseCategory()], true);
    await expandPanelAndReturn(container, "c-1", sampleResult());
    vi.spyOn(window, "confirm").mockReturnValue(true);
    mockDeleteProduct.mockResolvedValue(undefined);
    // After the delete, the production re-fetch would return the
    // post-delete state (1 product, p-2 gone). Queue that response
    // BEFORE calling mockClear (which wipes both call history AND
    // queued responses).
    mockGetStoreProducts.mockResolvedValueOnce(
      sampleResult({
        products: [
          {
            id: "p-1",
            name: "Apple",
            sku: "A-1",
            status: "active",
            store_id: "s-1",
            stores: { name: "FreshCart", code: "FRESH01" },
          },
        ],
        total: 1,
        totalPages: 1,
      }),
    );
    mockGetStoreProducts.mockClear();

    await act(async () => {
      (container.querySelector('[data-testid="category-product-delete-p-2"]') as HTMLButtonElement).click();
    });

    // 1. deleteProduct called with the right id
    expect(mockDeleteProduct).toHaveBeenCalledWith("p-2");

    // 2. mockGetStoreProducts re-invoked (to refresh the list)
    expect(mockGetStoreProducts).toHaveBeenCalled();
    const lastCall = mockGetStoreProducts.mock.calls.at(-1)!;
    expect(lastCall[0]).toBe("c-1");

    // 3. Pane re-rendered with the refreshed data — p-2 is gone,
    //    only p-1's row is left. The test asserts the row data, not
    //    the empty state, so the mock is realistic.
    const p1Row = container.querySelector('[data-testid="category-product-row-p-1"]');
    const p2Row = container.querySelector('[data-testid="category-product-row-p-2"]');
    expect(p1Row).not.toBeNull();
    expect(p2Row).toBeNull();
    cleanup();
  });

  it("on deleteProduct rejection: toast.error fires and the list is NOT re-fetched", async () => {
    const { container, cleanup } = render([baseCategory()], true);
    await expandPanelAndReturn(container, "c-1", sampleResult());
    vi.spyOn(window, "confirm").mockReturnValue(true);
    mockDeleteProduct.mockRejectedValue(new Error("FK violation on inventory_log"));
    mockGetStoreProducts.mockClear();

    await act(async () => {
      (container.querySelector('[data-testid="category-product-delete-p-1"]') as HTMLButtonElement).click();
    });

    expect(mockDeleteProduct).toHaveBeenCalled();
    // Don't re-fetch on failure — operator can retry
    expect(mockGetStoreProducts).not.toHaveBeenCalled();
    cleanup();
  });
});
