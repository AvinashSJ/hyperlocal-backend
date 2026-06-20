/**
 * Computes the discount percent from MRP and selling price.
 *
 * Formula: ((mrp - selling_price) / mrp) * 100
 *
 * Edge cases:
 * - mrp = 0: returns 0 (avoids division by zero)
 * - selling_price >= mrp: returns 0 (clamped — no negative discounts)
 * - both 0: returns 0
 * - result rounded to 2 decimal places
 */
export function computeDiscountPercent(mrp: number, sellingPrice: number): number {
  if (!mrp || mrp <= 0) return 0;
  if (sellingPrice >= mrp) return 0;
  const raw = ((mrp - sellingPrice) / mrp) * 100;
  return Math.round(raw * 100) / 100;
}

/**
 * Returns a human-readable display string for the discount.
 * - mrp = 0 → "—" (cannot compute)
 * - discount = 0 → "No discount"
 * - discount = 100 → "100% off"
 * - otherwise → "{N}% off" (2 dp when needed)
 */
export function formatDiscountLabel(mrp: number, sellingPrice: number): string {
  if (!mrp || mrp <= 0) return "—";
  const pct = computeDiscountPercent(mrp, sellingPrice);
  if (pct === 0) return "No discount";
  if (pct === 100) return "100% off";
  return `${pct % 1 === 0 ? pct : pct.toFixed(2)}% off`;
}
