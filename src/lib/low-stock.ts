/**
 * Low-stock detection, shared by the dashboard alerts and the products
 * list filter so both use the same rule.
 *
 * Resolution order:
 *   variant.low_stock_threshold ?? product.low_stock_threshold ?? 10
 *
 * A product with no threshold set is treated as having a threshold of 10.
 */

export const DEFAULT_LOW_STOCK_THRESHOLD = 10;

export function lowStockThreshold(
  threshold: number | null | undefined,
  fallback?: number | null | undefined,
): number {
  return threshold ?? fallback ?? DEFAULT_LOW_STOCK_THRESHOLD;
}

export function isLowStock(
  stock: number | null | undefined,
  threshold: number | null | undefined,
  fallback?: number | null | undefined,
): boolean {
  return Number(stock ?? 0) <= lowStockThreshold(threshold, fallback);
}
