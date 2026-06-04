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

  const parentMap = new Map(allParents?.map((p) => [p.id, p.name]) ?? []);

  const rows: CategoryRow[] =
    categories?.map((cat) => ({
      ...cat,
      parent_name: cat.parent_id ? parentMap.get(cat.parent_id) ?? null : null,
    })) ?? [];

  return rows;
}

export default async function CategoriesPage() {
  const { permissions } = await requirePermission("categories", "view");
  const categories = await getCategories();
  const actionPerms = getActionPermissions(permissions, "categories");

  return <CategoriesClient categories={categories} actionPerms={actionPerms} />;
}
