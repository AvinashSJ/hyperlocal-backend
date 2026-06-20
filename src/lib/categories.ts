import { createAdminClient } from "@/lib/supabase/admin";

export type CategoryNode = {
  id: string;
  name: string;
  parent_id: string | null;
  sort_order: number;
};

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
