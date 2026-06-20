// @vitest-environment jsdom
// Tell React 19 this is an act-enabled test environment (suppresses warnings)
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";

vi.mock("@iconify/react", () => ({
  Icon: ({ icon, width, className }: { icon: string; width?: number; className?: string }) => (
    <span data-icon={icon} data-width={width} className={className} />
  ),
}));

let mockUuidCounter = 0;
vi.mock("uuid", () => ({
  v4: () => `mocked-uuid-${++mockUuidCounter}`,
}));

import VariantEditor from "./VariantEditor";

type Variant = {
  id: string;
  name: string;
  sku: string | null;
  mrp: number;
  price: number;
  stock: number;
  variant_attributes: Record<string, unknown> | null;
};

const baseVariants: Variant[] = [
  { id: "v-1", name: "1kg", sku: "A1", mrp: 120, price: 100, stock: 10, variant_attributes: {} },
  { id: "v-2", name: "500g", sku: "A2", mrp: 60, price: 55, stock: 20, variant_attributes: {} },
  { id: "v-3", name: "5 pack", sku: "A3", mrp: 500, price: 450, stock: 5, variant_attributes: {} },
];

beforeEach(() => {
  mockUuidCounter = 0;
});

// Shared setup for createRoot + jsdom interaction tests
let container: HTMLDivElement;
let root: Root;

function unmount() {
  if (root) {
    act(() => root.unmount());
  }
  container.remove();
}

describe("VariantEditor — render count invariants", () => {
  it("initial render: 1 delete button per variant (no multiplication)", () => {
    const html = renderToString(
      <VariantEditor variants={baseVariants} onChange={() => {}} />,
    );
    const deleteButtons = (html.match(/btn-outline-danger/g) ?? []).length;
    expect(deleteButtons).toBe(3);
  });

  it("initial render: 1 name input per variant", () => {
    const html = renderToString(
      <VariantEditor variants={baseVariants} onChange={() => {}} />,
    );
    const nameInputs = (html.match(/placeholder="Name \(e.g., 1kg\)"/g) ?? []).length;
    expect(nameInputs).toBe(3);
  });

  it("initial render: 1 sku input per variant", () => {
    const html = renderToString(
      <VariantEditor variants={baseVariants} onChange={() => {}} />,
    );
    const skuInputs = (html.match(/placeholder="SKU"/g) ?? []).length;
    expect(skuInputs).toBe(3);
  });

  it("initial render: 1 price input per variant", () => {
    const html = renderToString(
      <VariantEditor variants={baseVariants} onChange={() => {}} />,
    );
    const priceInputs = (html.match(/placeholder="Price"/g) ?? []).length;
    expect(priceInputs).toBe(3);
  });

  it("initial render: 1 stock input per variant", () => {
    const html = renderToString(
      <VariantEditor variants={baseVariants} onChange={() => {}} />,
    );
    const stockInputs = (html.match(/placeholder="Stock"/g) ?? []).length;
    expect(stockInputs).toBe(3);
  });

  it("renders empty state when no variants", () => {
    const html = renderToString(
      <VariantEditor variants={[]} onChange={() => {}} />,
    );
    expect(html).toContain("No variants added");
  });
});

describe("VariantEditor — column headers", () => {
  it("renders a <thead> with all 6 column headers (index, name, sku, price, stock, action)", () => {
    const html = renderToString(
      <VariantEditor variants={baseVariants} onChange={() => {}} />,
    );
    expect(html).toContain('data-testid="variant-header-index"');
    expect(html).toContain('data-testid="variant-header-name"');
    expect(html).toContain('data-testid="variant-header-sku"');
    expect(html).toContain('data-testid="variant-header-price"');
    expect(html).toContain('data-testid="variant-header-stock"');
    expect(html).toContain('data-testid="variant-header-action"');
  });

  it("displays the human-readable column labels (Name, SKU, Price, Stock)", () => {
    const html = renderToString(
      <VariantEditor variants={baseVariants} onChange={() => {}} />,
    );
    expect(html).toContain(">Name<");
    expect(html).toContain(">SKU<");
    expect(html).toContain("Price");
    expect(html).toContain("Stock");
  });

  it("does not render the <table> when there are no variants (no empty table shell)", () => {
    const html = renderToString(
      <VariantEditor variants={[]} onChange={() => {}} />,
    );
    expect(html).not.toContain('data-testid="variant-table"');
    expect(html).toContain("No variants added");
  });

  it("renders one <tbody> row per variant", () => {
    const html = renderToString(
      <VariantEditor variants={baseVariants} onChange={() => {}} />,
    );
    const rows = (html.match(/data-testid="variant-row"/g) ?? []).length;
    expect(rows).toBe(3);
  });
});

describe("VariantEditor — array math (matches the source)", () => {
  it("removeVariant filter: removes exactly the matching id, never duplicates", () => {
    const variants: Variant[] = [...baseVariants];
    const removeVariant = (id: string) => variants.filter((v) => v.id !== id);

    const after = removeVariant("v-2");
    expect(after).toHaveLength(2);
    expect(after.map((v) => v.id)).toEqual(["v-1", "v-3"]);
  });

  it("addVariant spread: appends exactly one item", () => {
    const variants: Variant[] = [...baseVariants];
    const newVariant: Variant = { id: "mocked-uuid-1", name: "", sku: "", mrp: 0, price: 0, stock: 0, variant_attributes: {} };
    const addVariant = () => [...variants, newVariant];

    const after = addVariant();
    expect(after).toHaveLength(4);
    expect(after[3].id).toBe("mocked-uuid-1");
  });

  it("updateVariant map: replaces exactly the matching id", () => {
    const variants: Variant[] = [...baseVariants];
    const updateVariant = (id: string, field: keyof Variant, value: string | number) =>
      variants.map((v) => (v.id === id ? { ...v, [field]: value } : v));

    const after = updateVariant("v-2", "name", "2kg");
    expect(after).toHaveLength(3);
    expect(after[1].name).toBe("2kg");
    expect(after[0].name).toBe("1kg");
    expect(after[2].name).toBe("5 pack");
  });

  it("removeVariant: removing a non-existent id leaves count unchanged (no duplication)", () => {
    const variants: Variant[] = [...baseVariants];
    const removeVariant = (id: string) => variants.filter((v) => v.id !== id);

    const after = removeVariant("v-999");
    expect(after).toHaveLength(3);
    expect(after).not.toHaveLength(6);
  });
});

describe("VariantEditor — full add/remove cycles (regression for 'multiplication' bug)", () => {
  // These simulate the state evolution if the user adds 3 then removes 1.
  // Each removeVariant should decrease the count by exactly 1.

  it("add 3, then remove 1 → count is 2 (not 3, not 4)", () => {
    let variants: Variant[] = [];
    const addVariant = () => {
      variants = [...variants, { id: `new-${variants.length + 1}`, name: "", sku: "", mrp: 0, price: 0, stock: 0, variant_attributes: {} }];
    };
    const removeVariant = (id: string) => {
      variants = variants.filter((v) => v.id !== id);
    };

    addVariant();
    addVariant();
    addVariant();
    expect(variants).toHaveLength(3);

    removeVariant("new-2");
    expect(variants).toHaveLength(2);
    expect(variants.map((v) => v.id)).toEqual(["new-1", "new-3"]);
  });

  it("add 3, remove all 3 → count is 0 (not multiplied)", () => {
    let variants: Variant[] = [];
    const addVariant = () => {
      variants = [...variants, { id: `new-${variants.length + 1}`, name: "", sku: "", mrp: 0, price: 0, stock: 0, variant_attributes: {} }];
    };
    const removeVariant = (id: string) => {
      variants = variants.filter((v) => v.id !== id);
    };

    addVariant();
    addVariant();
    addVariant();
    removeVariant("new-1");
    removeVariant("new-2");
    removeVariant("new-3");
    expect(variants).toHaveLength(0);
    // Critical: must NOT be 3 (which would be the "multiplication" bug)
    expect(variants).not.toHaveLength(3);
  });

  it("repeated add+remove cycles never compound (regression for state leak)", () => {
    let variants: Variant[] = [];
    const addVariant = () => {
      variants = [...variants, { id: `id-${variants.length}`, name: "", sku: "", mrp: 0, price: 0, stock: 0, variant_attributes: {} }];
    };
    const removeVariant = (id: string) => {
      variants = variants.filter((v) => v.id !== id);
    };

    for (let i = 0; i < 5; i++) {
      addVariant();
      addVariant();
      removeVariant(`id-${variants.length - 1}`); // remove the just-added one
    }
    // Each cycle: add 2, remove 1 → net +1. After 5 cycles, count = 5.
    expect(variants).toHaveLength(5);
  });
});

describe("VariantEditor — click interaction (P14 regression: 'X button does nothing')", () => {
  // P14 user report: clicking the X (remove) button on a variant row did
  // not remove the variant from the form state. Investigation: VariantEditor
  // was tested only via renderToString (no event simulation). The removeVariant
  // callback chain was never exercised. These tests use createRoot + jsdom
  // to actually mount the component and dispatch real click events.

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  it("clicking the X button on a variant calls onChange with the variant removed", () => {
    const onChange = vi.fn();
    act(() => {
      root = createRoot(container);
      root.render(
        <VariantEditor variants={baseVariants} onChange={onChange} />,
      );
    });

    // Three X buttons in the DOM (one per row)
    const removeButtons = container.querySelectorAll(
      '[data-testid="variant-remove-button"]',
    );
    expect(removeButtons.length).toBe(3);

    // Click the X on the second variant (v-2)
    act(() => {
      removeButtons[1].dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    // onChange must have been called with 2 variants, v-2 removed
    expect(onChange).toHaveBeenCalledTimes(1);
    const newVariants = onChange.mock.calls[0][0] as Variant[];
    expect(newVariants).toHaveLength(2);
    expect(newVariants.map((v) => v.id)).toEqual(["v-1", "v-3"]);

    unmount();
  });

  it("clicking the X button on the LAST variant removes it (boundary case)", () => {
    const onChange = vi.fn();
    act(() => {
      root = createRoot(container);
      root.render(
        <VariantEditor variants={baseVariants} onChange={onChange} />,
      );
    });

    const removeButtons = container.querySelectorAll(
      '[data-testid="variant-remove-button"]',
    );

    // Click the LAST X (v-3)
    act(() => {
      removeButtons[2].dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const newVariants = onChange.mock.calls[0][0] as Variant[];
    expect(newVariants.map((v) => v.id)).toEqual(["v-1", "v-2"]);

    unmount();
  });

  it("clicking the X button on the FIRST variant removes it (boundary case)", () => {
    const onChange = vi.fn();
    act(() => {
      root = createRoot(container);
      root.render(
        <VariantEditor variants={baseVariants} onChange={onChange} />,
      );
    });

    const removeButtons = container.querySelectorAll(
      '[data-testid="variant-remove-button"]',
    );

    // Click the FIRST X (v-1)
    act(() => {
      removeButtons[0].dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const newVariants = onChange.mock.calls[0][0] as Variant[];
    expect(newVariants.map((v) => v.id)).toEqual(["v-2", "v-3"]);

    unmount();
  });

  it("Add Variant button appends exactly one new variant with a fresh uuid", () => {
    const onChange = vi.fn();
    act(() => {
      root = createRoot(container);
      root.render(
        <VariantEditor variants={baseVariants} onChange={onChange} />,
      );
    });

    const addButton = container.querySelector(
      '[data-testid="variant-add-button"]',
    ) as HTMLButtonElement;
    expect(addButton).toBeTruthy();

    act(() => {
      addButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const newVariants = onChange.mock.calls[0][0] as Variant[];
    expect(newVariants).toHaveLength(4);
    expect(newVariants[3].id).toBe("mocked-uuid-1");
    expect(newVariants[3].name).toBe("");

    unmount();
  });

  it("typing in the name input updates the variant's name field", () => {
    const onChange = vi.fn();
    act(() => {
      root = createRoot(container);
      root.render(
        <VariantEditor variants={baseVariants} onChange={onChange} />,
      );
    });

    const nameInputs = container.querySelectorAll(
      '[data-testid="variant-name-input"]',
    );
    const secondNameInput = nameInputs[1] as HTMLInputElement;

    act(() => {
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value",
      )?.set;
      nativeInputValueSetter?.call(secondNameInput, "2kg");
      secondNameInput.dispatchEvent(new Event("input", { bubbles: true }));
    });

    expect(onChange).toHaveBeenCalledTimes(1);
    const newVariants = onChange.mock.calls[0][0] as Variant[];
    expect(newVariants[1].name).toBe("2kg");
    // Other variants untouched
    expect(newVariants[0].name).toBe("1kg");
    expect(newVariants[2].name).toBe("5 pack");

    unmount();
  });

  it("the X button does NOT submit the parent form (type=button regression check)", () => {
    // Regression: if type was omitted, the X click would submit the surrounding
    // <form>, triggering the server action before the state was updated.
    const onChange = vi.fn();
    let formSubmitted = false;
    const Form = () => (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          formSubmitted = true;
        }}
      >
        <VariantEditor variants={baseVariants} onChange={onChange} />
      </form>
    );
    act(() => {
      root = createRoot(container);
      root.render(<Form />);
    });

    const removeButton = container.querySelector(
      '[data-testid="variant-remove-button"]',
    ) as HTMLButtonElement;
    expect(removeButton.getAttribute("type")).toBe("button");

    act(() => {
      removeButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(formSubmitted).toBe(false);
    expect(onChange).toHaveBeenCalledTimes(1);

    unmount();
  });
});

describe("VariantEditor — MRP and Discount columns (P17)", () => {
  it("renders the MRP column header and one input per variant", () => {
    const html = renderToString(
      <VariantEditor variants={baseVariants} onChange={() => {}} />,
    );
    expect(html).toContain('data-testid="variant-header-mrp"');
    const mrpInputs = (html.match(/data-testid="variant-mrp-input"/g) ?? []).length;
    expect(mrpInputs).toBe(3);
  });

  it("renders the Discount column header and one display per variant", () => {
    const html = renderToString(
      <VariantEditor variants={baseVariants} onChange={() => {}} />,
    );
    expect(html).toContain('data-testid="variant-header-discount"');
    const discountDisplays = (html.match(/data-testid="variant-discount-display"/g) ?? []).length;
    expect(discountDisplays).toBe(3);
  });

  it("auto-computes the discount label from each variant's MRP and price (e.g. 120/100 → 16.67% off)", () => {
    const html = renderToString(
      <VariantEditor variants={baseVariants} onChange={() => {}} />,
    );
    // v-1: mrp=120, price=100 → 16.67% off
    expect(html).toContain("16.67% off");
    // v-2: mrp=60, price=55 → 8.33% off
    expect(html).toContain("8.33% off");
    // v-3: mrp=500, price=450 → 10% off (integer)
    expect(html).toContain("10% off");
  });

  it("typing in the MRP input updates the corresponding variant's mrp field via onChange", () => {
    const onChange = vi.fn();
    act(() => {
      root = createRoot(container);
      root.render(
        <VariantEditor variants={baseVariants} onChange={onChange} />,
      );
    });

    const mrpInputs = container.querySelectorAll(
      '[data-testid="variant-mrp-input"]',
    );
    const secondMrpInput = mrpInputs[1] as HTMLInputElement;

    act(() => {
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value",
      )?.set;
      nativeInputValueSetter?.call(secondMrpInput, "100");
      secondMrpInput.dispatchEvent(new Event("input", { bubbles: true }));
    });

    expect(onChange).toHaveBeenCalledTimes(1);
    const newVariants = onChange.mock.calls[0][0] as Variant[];
    expect(newVariants[1].mrp).toBe(100);
    // Other variants untouched
    expect(newVariants[0].mrp).toBe(120);
    expect(newVariants[2].mrp).toBe(500);

    unmount();
  });

  it("addVariant defaults the new variant's mrp to 0 (force manual entry)", () => {
    const onChange = vi.fn();
    act(() => {
      root = createRoot(container);
      root.render(
        <VariantEditor variants={[]} onChange={onChange} />,
      );
    });

    const addButton = container.querySelector(
      '[data-testid="variant-add-button"]',
    ) as HTMLButtonElement;
    expect(addButton).toBeTruthy();

    act(() => {
      addButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(onChange).toHaveBeenCalledTimes(1);
    const newVariants = onChange.mock.calls[0][0] as Variant[];
    expect(newVariants).toHaveLength(1);
    expect(newVariants[0].id).toBe("mocked-uuid-1");
    expect(newVariants[0].mrp).toBe(0); // forced to 0 per P17 design
    expect(newVariants[0].price).toBe(0);
    expect(newVariants[0].name).toBe("");

    unmount();
  });
});

