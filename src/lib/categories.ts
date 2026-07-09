import { createAdminClient } from "@/lib/supabase/admin";

export type CategoryNode = {
  id: string;
  name: string;
  parent_id: string | null;
  sort_order: number;
};

/**
 * Given a flat list of all categories and a subset of IDs, returns the union
 * of the input IDs plus ALL descendants (recursively) of those IDs.
 *
 * Pure function — no DB calls. Used when assigning categories to a store so
 * that sub-categories are also materialized in `store_categories`.
 */
export function expandCategoryIdsWithDescendants(
  ids: string[],
  allCategories: CategoryNode[],
): string[] {
  const byParent = new Map<string, string[]>();
  for (const c of allCategories) {
    if (c.parent_id) {
      const list = byParent.get(c.parent_id) ?? [];
      list.push(c.id);
      byParent.set(c.parent_id, list);
    }
  }

  const result = new Set(ids);

  function walk(parentIds: string[]) {
    const children: string[] = [];
    for (const pid of parentIds) {
      const kids = byParent.get(pid);
      if (kids) {
        for (const kid of kids) {
          if (!result.has(kid)) {
            result.add(kid);
            children.push(kid);
          }
        }
      }
    }
    if (children.length > 0) walk(children);
  }

  walk(ids);
  return Array.from(result);
}

/**
 * Fetches the categories visible to a store-scoped user.
 *
 * Visibility rules:
 * 1. `storeId` is null (Super Admin / unscoped user): return ALL active categories.
 * 2. `storeId` is set: return the union of:
 *    a. Categories directly assigned via `store_categories` for this store.
 *    b. ALL descendants of those assigned categories (recursive — children,
 *       grandchildren, etc.). This means if a Super Admin assigns a parent
 *       like "Snacks" to the store, every subcategory under it is also
 *       visible without needing each to be linked separately.
 *
 * Inactive categories (is_active = false) are excluded.
 *
 * Used by:
 * - The products list/new/edit pages for the category dropdown
 * - The categories list page (so Manager sees only what Super Admin has set up)
 * - bulkImportProducts (so a Manager can only import products into visible categories)
 */
export async function getCategoriesForStore(
  storeId: string | null,
): Promise<CategoryNode[]> {
  const supabase = createAdminClient();

  if (!storeId) {
    const { data } = await supabase
      .from("categories")
      .select("id, name, parent_id, sort_order")
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("name");
    return (data ?? []) as CategoryNode[];
  }

  const { data: storeCats } = await supabase
    .from("store_categories")
    .select("category_id")
    .eq("store_id", storeId);

  const assignedIds = new Set<string>((storeCats ?? []).map((sc) => sc.category_id));
  if (assignedIds.size === 0) return [];

  // BFS down the tree: at each level, fetch the frontier IDs plus their
  // direct children (one query per level using a PostgREST `or` filter).
  // The loop terminates when a level returns no new children — the tree
  // is finite, so there is no infinite-loop risk.
  const visible = new Map<string, CategoryNode>();
  let frontier = Array.from(assignedIds);

  while (frontier.length > 0) {
    const list = frontier.join(",");
    const { data } = await supabase
      .from("categories")
      .select("id, name, parent_id, sort_order")
      .eq("is_active", true)
      .or(`id.in.(${list}),parent_id.in.(${list})`);

    const nextFrontier: string[] = [];
    for (const c of (data ?? []) as CategoryNode[]) {
      if (visible.has(c.id)) continue;
      visible.set(c.id, c);
      // A row is a NEW child of the current frontier when its parent_id is
      // in the frontier AND it was not in the original assigned set (the
      // assigned parents are already known, no need to re-walk).
      if (
        c.parent_id !== null &&
        frontier.includes(c.parent_id) &&
        !assignedIds.has(c.id)
      ) {
        nextFrontier.push(c.id);
      }
    }
    frontier = nextFrontier;
  }

  return Array.from(visible.values()).sort((a, b) => {
    if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
    return a.name.localeCompare(b.name);
  });
}

export type EffectiveStores = {
  /**
   * Own stores ∪ all ancestors' stores, deduped (ancestor-first then own).
   * For root categories this is just their own stores.
   */
  stores: string[];
  /**
   * True if the parent's stores contributed to this category's effective
   * list. Used by the categories table to show an "(inherited)" hint on
   * subcategories whose own store_categories is empty.
   */
  inherited: boolean;
};

/**
 * Pure helper: given the already-fetched rows (with `stores` already
 * populated by the categories page query), compute each row's effective
 * store list by walking up the tree.
 *
 * Display-only: does NOT mutate `store_categories`. The customer app
 * and the store-categories join table are unchanged. A subcategory with
 * no own rows in `store_categories` will show its parent's stores in
 * the "Stores" column, with an "(inherited)" hint.
 *
 * - Roots (parent_id is null) keep their own stores.
 * - Children get their own stores appended to their parent's effective list.
 * - Duplicate store names are removed (first occurrence wins, so the
 *   closest ancestor's order is preserved).
 * - Cycles are defended against (return own stores only).
 * - Parents not present in `rows` are treated as "no inherited stores".
 */
export function buildEffectiveStoresMap(
  rows: Array<{ id: string; parent_id: string | null; stores: string[] }>,
): Map<string, EffectiveStores> {
  const byId = new Map(rows.map((r) => [r.id, r]));

  const result = new Map<string, EffectiveStores>();
  const visiting = new Set<string>();

  const resolve = (id: string): EffectiveStores => {
    const cached = result.get(id);
    if (cached) return cached;
    if (visiting.has(id)) {
      // Cycle: bail out with own stores only. Category trees are not
      // supposed to cycle, but the helper is safe even if the data is.
      const node = byId.get(id);
      return { stores: [...(node?.stores ?? [])], inherited: false };
    }

    const node = byId.get(id);
    if (!node) {
      return { stores: [], inherited: false };
    }

    visiting.add(id);
    const own = node.stores ?? [];

    let inherited = false;
    let parentStores: string[] = [];
    if (node.parent_id !== null && byId.has(node.parent_id)) {
      const parentEffective = resolve(node.parent_id);
      if (parentEffective.stores.length > 0) inherited = true;
      parentStores = parentEffective.stores;
    }

    const merged: string[] = [];
    const seen = new Set<string>();
    for (const s of [...parentStores, ...own]) {
      if (seen.has(s)) continue;
      seen.add(s);
      merged.push(s);
    }

    const effective: EffectiveStores = { stores: merged, inherited };
    result.set(id, effective);
    visiting.delete(id);
    return effective;
  };

  for (const row of rows) {
    resolve(row.id);
  }
  return result;
}
