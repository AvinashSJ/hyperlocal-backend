import { requirePermission } from "@/lib/require-permission";
import { getStoreScope } from "@/lib/store-scope";
import { getCategoriesForStore } from "@/lib/categories";
import ProductForm from "../ProductForm";

export default async function NewProductPage() {
  // P33: pass isSuperAdmin so the form can render the cascade_locked
  // toggle for Super Admins (Manager users can only see defaults).
  const { isSuperAdmin } = await requirePermission("products", "view");
  const { storeId } = await getStoreScope();
  const categories = await getCategoriesForStore(storeId ?? null);

  return <ProductForm product={null} categories={categories} isSuperAdmin={isSuperAdmin} />;
}
