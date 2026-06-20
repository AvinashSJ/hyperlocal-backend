import { requirePermission, getActionPermissions } from "@/lib/require-permission";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCategoriesForStore } from "@/lib/categories";
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

  // P23: categories visible to the current user (Super Admin: all;
  // store-scoped: assigned + all descendants). Replaces the old
  // `in("id", catIds)` filter that dropped subcategories of assigned parents.
  const categories = await getCategoriesForStore(storeId ?? null);

  return { products: products ?? [], categories };
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
