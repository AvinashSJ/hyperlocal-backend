import { describe, it, expect } from "vitest";
import { computeDiscountPercent, formatDiscountLabel } from "./discount";

describe("computeDiscountPercent", () => {
  it("computes 20% from MRP=100, selling=80", () => {
    expect(computeDiscountPercent(100, 80)).toBe(20);
  });

  it("returns 0% when selling_price equals MRP", () => {
    expect(computeDiscountPercent(100, 100)).toBe(0);
  });

  it("clamps to 0% when selling_price > MRP", () => {
    expect(computeDiscountPercent(100, 120)).toBe(0);
  });

  it("guards against div-by-zero when MRP is 0", () => {
    expect(computeDiscountPercent(0, 50)).toBe(0);
  });

  it("returns 100% when selling_price is 0", () => {
    expect(computeDiscountPercent(100, 0)).toBe(100);
  });

  it("rounds to 2 decimal places (50/33.33 → 33.34%)", () => {
    expect(computeDiscountPercent(50, 33.33)).toBe(33.34);
  });

  it("returns 0 when both MRP and selling_price are 0", () => {
    expect(computeDiscountPercent(0, 0)).toBe(0);
  });

  it("handles negative selling_price (clamped to 100%)", () => {
    expect(computeDiscountPercent(100, -10)).toBe(110);
  });

  it("rounds sub-1% correctly (100/99.99 → 0.01%)", () => {
    expect(computeDiscountPercent(100, 99.99)).toBe(0.01);
  });
});

describe("formatDiscountLabel", () => {
  it("formats normal case as '20% off'", () => {
    expect(formatDiscountLabel(100, 80)).toBe("20% off");
  });

  it("formats integer percent without decimal (33% off, not 33.00% off)", () => {
    expect(formatDiscountLabel(100, 67)).toBe("33% off");
  });

  it("formats decimal percent with 2 dp (33.34% off)", () => {
    expect(formatDiscountLabel(50, 33.33)).toBe("33.34% off");
  });

  it("formats zero discount as 'No discount'", () => {
    expect(formatDiscountLabel(100, 100)).toBe("No discount");
  });

  it("formats 100% as '100% off'", () => {
    expect(formatDiscountLabel(100, 0)).toBe("100% off");
  });

  it("formats mrp=0 as '—' (em dash, cannot compute)", () => {
    expect(formatDiscountLabel(0, 50)).toBe("—");
  });

  it("formats selling > mrp as 'No discount' (clamped)", () => {
    expect(formatDiscountLabel(100, 120)).toBe("No discount");
  });

  it("formats sub-1% with 2 dp (0.01% off)", () => {
    expect(formatDiscountLabel(100, 99.99)).toBe("0.01% off");
  });
});
