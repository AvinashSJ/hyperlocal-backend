import { requirePermission, getActionPermissions } from "@/lib/require-permission";
import { createAdminClient } from "@/lib/supabase/admin";
import Link from "next/link";
import { Icon } from "@iconify/react";
import { getStoreScope } from "@/lib/store-scope";
import ProductsClient from "./ProductsClient";

async function getProducts(storeId?: string | null) {
  const supabase = createAdminClient();

  let productQuery = supabase
    .from("products")
    .select("*, categories(name)")
    .order("created_at", { ascending: false })
    .limit(100);
  if (storeId) productQuery = productQuery.eq("store_id", storeId);

  const { data: products } = await productQuery;

  let categoryQuery = supabase
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
    categoryQuery = categoryQuery.in("id", catIds);
  }

  const { data: categories } = await categoryQuery;

  return { products: products ?? [], categories: categories ?? [] };
}

export default async function ProductsPage() {
  const { permissions } = await requirePermission("products", "view");
  const { storeId } = await getStoreScope();
  const { products, categories } = await getProducts(storeId);
  const actionPerms = getActionPermissions(permissions, "products");

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h4 className="fw-bold mb-0">Products</h4>
        {actionPerms.canCreate && (
          <Link href="/products/new" className="btn btn-primary">
            <Icon icon="ri:add-line" className="me-1" />
            Add Product
          </Link>
        )}
      </div>

      <ProductsClient products={products} categories={categories} actionPerms={actionPerms} />
    </div>
  );
}
