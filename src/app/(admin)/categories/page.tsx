import { requirePermission, getActionPermissions } from "@/lib/require-permission";
import { createAdminClient } from "@/lib/supabase/admin";
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
  parent_name?: string | null;
  product_count: number;
  stores: string[];
};

async function getCategories() {
  const supabase = createAdminClient();

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

  const rows: CategoryRow[] =
    categories?.map((cat) => ({
      ...cat,
      parent_name: cat.parent_id ? parentMap.get(cat.parent_id) ?? null : null,
      product_count: productCountMap.get(cat.id) ?? 0,
      stores: storeNamesMap.get(cat.id) ?? [],
    })) ?? [];

  return rows;
}

export default async function CategoriesPage() {
  const { permissions } = await requirePermission("categories", "view");
  const categories = await getCategories();
  const actionPerms = getActionPermissions(permissions, "categories");

  return <CategoriesClient categories={categories} actionPerms={actionPerms} />;
}
