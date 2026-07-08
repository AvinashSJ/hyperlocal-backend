// @vitest-environment jsdom
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import { describe, it, expect, beforeEach, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";

vi.mock("next/navigation", () => ({
  usePathname: vi.fn(() => "/products"),
  useRouter: vi.fn(() => ({ push: vi.fn(), refresh: vi.fn() })),
  useSearchParams: vi.fn(() => new URLSearchParams()),
  useParams: vi.fn(() => ({})),
  redirect: vi.fn(),
  notFound: vi.fn(),
}));

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
  createProduct: vi.fn(),
  updateProduct: vi.fn(),
}));

vi.mock("./actions", () => ({
  createProduct: mocks.createProduct,
  updateProduct: mocks.updateProduct,
}));

vi.mock("@/components/ImagePickerModal", () => ({
  default: () => null,
}));

import ProductForm from "./ProductForm";
import { toast } from "react-toastify";

type ProductVariant = {
  id: string;
  name: string;
  sku: string | null;
  mrp: number;
  price: number;
  stock: number;
  variant_attributes: Record<string, unknown> | null;
};

type Product = {
  id: string;
  name: string;
  description: string | null;
  sku: string | null;
  category_id: string | null;
  brand: string | null;
  unit_of_measurement: string;
  mrp: number;
  selling_price: number;
  discount_percent: number;
  gst_rate: number;
  hsn_code: string | null;
  is_gst_exempted: boolean;
  min_order_qty: number;
  max_order_qty: number | null;
  stock_quantity: number;
  low_stock_threshold: number | null;
  purchase_rate: number | null;
  status: string;
  store_id: string | null;
  categories?: { name: string } | null;
  variants?: ProductVariant[];
  images?: { id: string; image_url: string; is_primary: boolean; sort_order: number }[];
};

const categories = [
  { id: "c-1", name: "Snacks", parent_id: null, sort_order: 0 },
];

const sampleVariants: ProductVariant[] = [
  { id: "v-1", name: "80g", sku: "SNT-80", mrp: 100, price: 80, stock: 50, variant_attributes: {} },
  { id: "v-2", name: "90g", sku: "SNT-90", mrp: 120, price: 90, stock: 30, variant_attributes: {} },
];

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  vi.mocked(toast.success).mockClear();
  vi.mocked(toast.error).mockClear();
  mocks.createProduct.mockReset();
  mocks.updateProduct.mockReset();
  mocks.createProduct.mockResolvedValue(undefined);
  mocks.updateProduct.mockResolvedValue(undefined);
  mockUuidCounter = 0;
});

function unmount() {
  if (root) {
    act(() => root.unmount());
  }
  container.remove();
}

describe("ProductForm — Pricing & Inventory state (P17)", () => {
  it("when the product has 0 variants, the MRP/Selling/Discount fields are editable inputs", () => {
    const product: Product = {
      id: "p-1",
      name: "Test",
      description: null,
      sku: null,
      category_id: "c-1",
      brand: null,
      unit_of_measurement: "piece",
      mrp: 100,
      selling_price: 80,
      discount_percent: 20,
      gst_rate: 0,
      hsn_code: null,
      is_gst_exempted: false,
      min_order_qty: 1,
      max_order_qty: null,
      stock_quantity: 10,
      low_stock_threshold: 5,
      purchase_rate: null,
      status: "active",
      store_id: null,
      variants: [],
      images: [],
    };

    act(() => {
      root = createRoot(container);
      root.render(<ProductForm product={product} categories={categories} />);
    });

    // Read-only summary should NOT be present
    expect(container.querySelector('[data-testid="product-pricing-readonly"]')).toBeFalsy();

    // Editable inputs should be present
    const mrpInput = container.querySelector('input[name="mrp"]') as HTMLInputElement;
    const sellingInput = container.querySelector('input[name="selling_price"]') as HTMLInputElement;
    expect(mrpInput).toBeTruthy();
    expect(sellingInput).toBeTruthy();
    expect(mrpInput.value).toBe("100");
    expect(sellingInput.value).toBe("80");

    // Discount display shows auto-computed value
    expect(container.textContent).toContain("20% off");

    unmount();
  });

  it("when the product has 1+ variants, MRP/Selling/Discount become a read-only summary showing derived (min) values", () => {
    const product: Product = {
      id: "p-1",
      name: "santoor soap",
      description: null,
      sku: null,
      category_id: "c-1",
      brand: null,
      unit_of_measurement: "piece",
      mrp: 100, // product-level (will be ignored when variants exist)
      selling_price: 80,
      discount_percent: 20,
      gst_rate: 0,
      hsn_code: null,
      is_gst_exempted: false,
      min_order_qty: 1,
      max_order_qty: null,
      stock_quantity: 10,
      low_stock_threshold: 5,
      purchase_rate: null,
      status: "active",
      store_id: null,
      variants: sampleVariants, // 80g: mrp=100/price=80, 90g: mrp=120/price=90
      images: [],
    };

    act(() => {
      root = createRoot(container);
      root.render(<ProductForm product={product} categories={categories} />);
    });

    // Read-only summary IS present
    const readonlyBlock = container.querySelector('[data-testid="product-pricing-readonly"]');
    expect(readonlyBlock).toBeTruthy();

    // Editable inputs should NOT be present
    expect(container.querySelector('input[name="mrp"]')).toBeFalsy();
    expect(container.querySelector('input[name="selling_price"]')).toBeFalsy();

    // Min MRP = 100, min Selling = 80
    expect(container.textContent).toContain("Derived from variants");
    expect(readonlyBlock!.textContent).toContain("min MRP: ₹100");
    expect(readonlyBlock!.textContent).toContain("min Selling: ₹80");

    // The displayed MRP/Selling are the derived (min) values
    const mrpDisplay = container.querySelector('[data-testid="product-pricing-mrp"]');
    const sellingDisplay = container.querySelector('[data-testid="product-pricing-selling"]');
    expect(mrpDisplay!.textContent).toBe("₹100");
    expect(sellingDisplay!.textContent).toBe("₹80");

    unmount();
  });

  it("on save with 1+ variants, FormData mrp/selling_price are the derived (min) values, not the form state", async () => {
    const product: Product = {
      id: "p-1",
      name: "santoor soap",
      description: null,
      sku: null,
      category_id: "c-1",
      brand: null,
      unit_of_measurement: "piece",
      mrp: 100,
      selling_price: 80,
      discount_percent: 20,
      gst_rate: 0,
      hsn_code: null,
      is_gst_exempted: false,
      min_order_qty: 1,
      max_order_qty: null,
      stock_quantity: 10,
      low_stock_threshold: 5,
      purchase_rate: null,
      status: "active",
      store_id: null,
      variants: sampleVariants,
      images: [],
    };

    mocks.updateProduct.mockImplementation(async (id: string, fd: FormData) => {
      // Capture the FormData for assertion
      (globalThis as { __capturedFormData?: FormData }).__capturedFormData = fd;
    });

    await act(async () => {
      root = createRoot(container);
      root.render(<ProductForm product={product} categories={categories} />);
    });

    const form = container.querySelector("form") as HTMLFormElement;
    expect(form).toBeTruthy();

    await act(async () => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mocks.updateProduct).toHaveBeenCalledTimes(1);
    const fd = (globalThis as { __capturedFormData?: FormData }).__capturedFormData!;
    expect(fd).toBeTruthy();
    // Derived (min) values: min MRP=100, min Selling=80
    expect(fd.get("mrp")).toBe("100");
    expect(fd.get("selling_price")).toBe("80");
    // Variants JSON should be passed through
    const variantsStr = fd.get("variants") as string;
    expect(variantsStr).toBeTruthy();
    const variantsParsed = JSON.parse(variantsStr);
    expect(variantsParsed).toHaveLength(2);
    expect(variantsParsed[0].mrp).toBe(100);
    expect(variantsParsed[0].price).toBe(80);

    unmount();
  });

  // P18 + P19: regression for "next_redirect error" reported by the user
  it("P19: handleSubmit uses runServerAction — NEXT_REDIRECT sentinel is re-thrown, not shown as toast error", async () => {
    // The helper re-throws NEXT_REDIRECT sentinels so Next.js can navigate.
    // toast.error must NOT be called for the redirect.
    mocks.createProduct.mockRejectedValue(new Error("NEXT_REDIRECT:/products"));

    act(() => {
      root = createRoot(container);
      root.render(<ProductForm product={null} categories={categories} />);
    });

    const form = container.querySelector("form") as HTMLFormElement;
    expect(form).toBeTruthy();

    // Submit the form. The createProduct mock throws NEXT_REDIRECT.
    // handleSubmit's runServerAction call should re-throw it, so the unhandledRejection
    // is what propagates. Attach a no-op handler so the test runner doesn't fail.
    const prevHandler = process.listeners("unhandledRejection");
    process.on("unhandledRejection", () => {});

    await act(async () => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    process.removeListener("unhandledRejection", prevHandler[0] as (...args: unknown[]) => void);

    // Critical: the NEXT_REDIRECT was re-thrown by runServerAction, so toast.error was NOT called
    expect(toast.error).not.toHaveBeenCalled();
    // The success toast was also not called (because the action didn't succeed)
    expect(toast.success).not.toHaveBeenCalled();

    unmount();
  });
});
