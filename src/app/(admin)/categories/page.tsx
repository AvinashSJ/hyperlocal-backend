import { requirePermission, getActionPermissions } from "@/lib/require-permission";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStoreScope } from "@/lib/store-scope";
import { getCategoriesForStore } from "@/lib/categories";
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
  stores: string[];
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

  const rows: CategoryRow[] = (categories ?? [])
    .filter((cat) => visibleIds.has(cat.id))
    .map((cat) => ({
      ...cat,
      parent_name: cat.parent_id ? parentMap.get(cat.parent_id) ?? null : null,
      product_count: productCountMap.get(cat.id) ?? 0,
      stores: storeNamesMap.get(cat.id) ?? [],
    }));

  return rows;
}

export default async function CategoriesPage() {
  const { permissions } = await requirePermission("categories", "view");
  const { storeId } = await getStoreScope();
  const categories = await getCategoriesForAdmin(storeId);
  const actionPerms = getActionPermissions(permissions, "categories");

  return <CategoriesClient categories={categories} actionPerms={actionPerms} />;
}
