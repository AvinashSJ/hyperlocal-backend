import { requirePermission, getActionPermissions } from "@/lib/require-permission";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStoreScope } from "@/lib/store-scope";
import { getCategoriesForStore, buildEffectiveStoresMap } from "@/lib/categories";
import CategoriesClient from "./CategoriesClient";

type CategoryRow = {
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
  pending_deletion_at: string | null; // P33
  parent_name?: string | null;
  product_count: number;
  /** Stores directly assigned via store_categories. Used by the delete modal. */
  stores: string[];
  /** Stores actually shown in the Stores column (own ∪ parent's, display-only). */
  effective_stores: string[];
  /** True if `effective_stores` includes the parent's contribution. */
  stores_inherited: boolean;
  /** Number of direct subcategories. Used to block parent delete. */
  children_count: number;
};

async function getCategoriesForAdmin(storeId: string | null) {
  const supabase = createAdminClient();

  // P23: a Manager sees only the categories Super Admin has assigned to
  // their store (plus all descendants). Super Admin sees all.
  // The list page needs additional metadata (parent name, product count,
  // store names) that the helper doesn't provide, so we use the helper
  // as the source-of-truth for which IDs to include, then enrich from
  // a separate full-categories query.
  const visibleNodes = await getCategoriesForStore(storeId);
  const visibleIds = new Set(visibleNodes.map((n) => n.id));

  const { data: categories } = await supabase
    .from("categories")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  const { data: allParents } = await supabase
    .from("categories")
    .select("id, name");

  const { data: allProducts } = await supabase
    .from("products")
    .select("category_id");

  const { data: storeCats } = await supabase
    .from("store_categories")
    .select("category_id, stores!inner(name)");

  const storeNamesMap = new Map<string, string[]>();
  storeCats?.forEach((sc) => {
    const names = storeNamesMap.get(sc.category_id) ?? [];
    names.push((sc.stores as unknown as { name: string }).name);
    storeNamesMap.set(sc.category_id, names);
  });

  const productCountMap = new Map<string, number>();
  allProducts?.forEach((p) => {
    if (p.category_id) {
      productCountMap.set(p.category_id, (productCountMap.get(p.category_id) ?? 0) + 1);
    }
  });

  const parentMap = new Map(allParents?.map((p) => [p.id, p.name]) ?? []);

  // Direct-child counts per parent. We need a parent_id → childCount map
  // for the "block parent delete" check.
  const childrenCountMap = new Map<string, number>();
  (categories ?? []).forEach((cat) => {
    if (cat.parent_id) {
      childrenCountMap.set(
        cat.parent_id,
        (childrenCountMap.get(cat.parent_id) ?? 0) + 1,
      );
    }
  });

  const visibleRows = (categories ?? []).filter((cat) => visibleIds.has(cat.id));

  // Display-only inheritance: subcategory stores column shows own ∪ parent's.
  // Built from the already-fetched rows — no extra query.
  const effectiveStores = buildEffectiveStoresMap(
    visibleRows.map((r) => ({
      id: r.id,
      parent_id: r.parent_id,
      stores: storeNamesMap.get(r.id) ?? [],
    })),
  );

  const rows: CategoryRow[] = visibleRows.map((cat) => {
    const effective = effectiveStores.get(cat.id) ?? { stores: [], inherited: false };
    return {
      ...cat,
      parent_name: cat.parent_id ? parentMap.get(cat.parent_id) ?? null : null,
      product_count: productCountMap.get(cat.id) ?? 0,
      stores: storeNamesMap.get(cat.id) ?? [],
      effective_stores: effective.stores,
      stores_inherited: effective.inherited,
      children_count: childrenCountMap.get(cat.id) ?? 0,
    };
  });

  return rows;
}

export default async function CategoriesPage() {
  const { permissions, isSuperAdmin } = await requirePermission("categories", "view");
  const { storeId } = await getStoreScope();
  const categories = await getCategoriesForAdmin(storeId);
  const actionPerms = getActionPermissions(permissions, "categories");

  return (
    <CategoriesClient
      categories={categories}
      actionPerms={actionPerms}
      isSuperAdmin={isSuperAdmin}
    />
  );
}
