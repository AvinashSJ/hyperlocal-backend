import { requirePermission, getActionPermissions } from "@/lib/require-permission";
import { getCategoriesForStore } from "@/lib/categories";
import Link from "next/link";
import { Icon } from "@iconify/react";
import { getStoreScope } from "@/lib/store-scope";
import ProductsClient from "./ProductsClient";
import { getProducts } from "./actions";

export default async function ProductsPage() {
  const { permissions } = await requirePermission("products", "view");
  const { storeId } = await getStoreScope();
  // Cast: getProducts returns the joined categories field too, but
  // ProductsClient only uses the base Product shape.
  const products = (await getProducts(storeId)) as Parameters<
    typeof ProductsClient
  >[0]["products"];
  // P23: categories visible to the current user (Super Admin: all;
  // store-scoped: assigned + all descendants). Replaces the old
  // `in("id", catIds)` filter that dropped subcategories of assigned parents.
  const categories = await getCategoriesForStore(storeId ?? null);
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
