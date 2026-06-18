import { createAdminClient } from "@/lib/supabase/admin";
import { requirePermission } from "@/lib/require-permission";
import { getStoreScope } from "@/lib/store-scope";
import ProductForm from "../ProductForm";

async function getCategories(storeId?: string | null) {
  const supabase = createAdminClient();
  let query = supabase
    .from("categories")
    .select("id, name, parent_id, sort_order")
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .order("name");
  if (storeId) {
    const { data: storeCats } = await supabase
      .from("store_categories")
      .select("category_id")
      .eq("store_id", storeId);
    const catIds = (storeCats ?? []).map((c) => c.category_id);
    query = query.in("id", catIds);
  }
  const { data } = await query;
  return data ?? [];
}

export default async function NewProductPage() {
  await requirePermission("products", "view");
  const { storeId } = await getStoreScope();
  const categories = await getCategories(storeId);

  return <ProductForm product={null} categories={categories} />;
}
