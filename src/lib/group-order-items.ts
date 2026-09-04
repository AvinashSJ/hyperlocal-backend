export type ResolvedCategory = {
  /** Id of the root category to group under (the parent's id for subcategories). */
  rootId: string;
  /** Display name of the root group. */
  rootName: string;
  /** Subcategory id, or null when the item's category is a root category. */
  subId: string | null;
  /** Subcategory name, or "" when the item's category is a root category. */
  subName: string;
};

export type OrderItemGroup<T> = {
  rootId: string | null;
  rootName: string;
  subcategories: OrderItemSubgroup<T>[];
};

export type OrderItemSubgroup<T> = {
  id: string | null;
  name: string;
  items: T[];
};

export type CategoryResolver<T> = (item: T) => ResolvedCategory | null;

/** The raw shape returned by Supabase join: products.categories + parent_cat. */
export type RawCategoryJoin = {
  id: string;
  name: string;
  parent_id: string | null;
  parent_cat: { name: string } | null;
} | null;

/** Convenience resolver for items with `products?.categories` (order/invoice shape). */
export function resolveItemCategory(
  item: { products?: { categories?: RawCategoryJoin } | null } | null | undefined,
): ResolvedCategory | null {
  const cat = item?.products?.categories;
  if (!cat) return null;

  if (cat.parent_id && cat.parent_cat) {
    return {
      rootId: cat.parent_id,
      rootName: cat.parent_cat.name,
      subId: cat.id,
      subName: cat.name,
    };
  }

  return {
    rootId: cat.id,
    rootName: cat.name,
    subId: null,
    subName: "",
  };
}

/**
 * Groups order items under Category > Subcategory headers resolved from each
 * product's category chain.
 *
 * `resolveCategory` extracts the normalized category from an item. The three
 * call sites (order detail, invoice detail, invoice PDF) each pass their own
 * accessor that reads `item.products?.categories` and maps the query shape
 * (`parent_cat.name`) to `rootName` / `rootId`.
 *
 * Rules:
 * - Root categories (no parent) form one group each, labelled by their name.
 * - Subcategory items fold into their root group (via rootId) and land in a
 *   sub-group labelled by the subcategory name.
 * - Items resolving to null (deleted product / no category) go to a trailing
 *   "Uncategorized" group.
 * - Items keep their original order; root groups are sorted by name.
 *
 * Pure — no DB access.
 */
export function groupOrderItems<T>(
  items: T[],
  resolveCategory: CategoryResolver<T>,
): OrderItemGroup<T>[] {
  const groups = new Map<string, OrderItemGroup<T>>();
  const uncategorized: T[] = [];

  for (const item of items) {
    const cat = resolveCategory(item);

    if (!cat) {
      uncategorized.push(item);
      continue;
    }

    let group = groups.get(cat.rootId);
    if (!group) {
      group = { rootId: cat.rootId, rootName: cat.rootName, subcategories: [] };
      groups.set(cat.rootId, group);
    }

    let subgroup = group.subcategories.find((s) => s.id === cat.subId);
    if (!subgroup) {
      subgroup = { id: cat.subId, name: cat.subName, items: [] };
      group.subcategories.push(subgroup);
    }
    subgroup.items.push(item);
  }

  const result: OrderItemGroup<T>[] = Array.from(groups.values()).sort((a, b) =>
    a.rootName.localeCompare(b.rootName),
  );

  if (uncategorized.length > 0) {
    result.push({
      rootId: null,
      rootName: "Uncategorized",
      subcategories: [{ id: null, name: "", items: uncategorized }],
    });
  }
  return result;
}