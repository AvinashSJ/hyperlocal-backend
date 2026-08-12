import { requirePermission, getActionPermissions } from "@/lib/require-permission";
import { getCategoriesForStore } from "@/lib/categories";
import Link from "next/link";
import { Icon } from "@iconify/react";
import { getStoreScope } from "@/lib/store-scope";
import ProductsClient from "./ProductsClient";
import { getProducts } from "./actions";

// P80: rows per page. Products are filtered + paginated server-side via
// URL search params (q, category, status, lowStock, page).
export const PAGE_SIZE = 20;

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { permissions } = await requirePermission("products", "view");
  const { storeId } = await getStoreScope();

  const sp = await searchParams;
  const query = typeof sp.q === "string" ? sp.q.trim() : "";
  const categoryFilter = typeof sp.category === "string" ? sp.category : "";
  const statusFilter = typeof sp.status === "string" ? sp.status : "";
  const lowStockOnly = sp.lowStock === "1";
  const requestedPage = Math.max(1, Number(sp.page) || 1);

  // P23: categories visible to the current user (Super Admin: all;
  // store-scoped: assigned + all descendants).
  const categories = await getCategoriesForStore(storeId ?? null);

  // Selecting a parent category includes its direct children (same
  // behavior the old client-side filter had).
  const categoryIds = categoryFilter
    ? [
        categoryFilter,
        ...categories.filter((c) => c.parent_id === categoryFilter).map((c) => c.id),
      ]
    : undefined;

  const options = {
    storeId,
    page: requestedPage,
    pageSize: PAGE_SIZE,
    search: query || undefined,
    categoryIds,
    status: statusFilter || undefined,
    lowStockOnly: lowStockOnly || undefined,
  };

  let { products, total } = await getProducts(options);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  // Clamp an out-of-range `?page=` to the last page so the table is
  // never rendered empty just because the URL said page=99.
  const page = Math.min(requestedPage, totalPages);
  if (page !== requestedPage) {
    const result = await getProducts({ ...options, page });
    products = result.products;
    total = result.total;
  }

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

      <ProductsClient
        products={products}
        categories={categories}
        actionPerms={actionPerms}
        total={total}
        page={page}
        totalPages={totalPages}
        pageSize={PAGE_SIZE}
        query={query}
        categoryFilter={categoryFilter}
        statusFilter={statusFilter}
        lowStockOnly={lowStockOnly}
      />
    </div>
  );
}
