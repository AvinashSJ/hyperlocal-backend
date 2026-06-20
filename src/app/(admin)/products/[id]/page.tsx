import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePermission } from "@/lib/require-permission";
import { getStoreScope } from "@/lib/store-scope";
import { getCategoriesForStore } from "@/lib/categories";
import { getEntityActivityLog } from "@/lib/activity-log";
import ProductForm from "../ProductForm";
import ProductActivityLog from "./ProductActivityLog";

type Props = {
  params: Promise<{ id: string }>;
};

async function getProduct(id: string) {
  const supabase = createAdminClient();

  const { data: product } = await supabase
    .from("products")
    .select("*, categories(name)")
    .eq("id", id)
    .single();

  if (!product) return null;

  const { data: variants } = await supabase
    .from("product_variants")
    .select("*")
    .eq("product_id", id)
    .order("name");

  const { data: images } = await supabase
    .from("product_images")
    .select("*")
    .eq("product_id", id)
    .order("sort_order");

  return { ...product, variants: variants ?? [], images: images ?? [] };
}

export default async function EditProductPage({ params }: Props) {
  const { id } = await params;
  // P33: pass the role check so the form knows whether to render the
  // Super-Admin-only `cascade_locked` toggle.
  const { isSuperAdmin } = await requirePermission("products", "view");
  const { storeId: userStoreId } = await getStoreScope();
  const product = await getProduct(id);

  if (!product) notFound();

  // P23: replaced inlined store_categories filter with the recursive helper
  const categories = await getCategoriesForStore(userStoreId ?? null);

  // P25: fetch the activity log for the activity-timeline section
  const activityLog = await getEntityActivityLog("product", id);

  return (
    <>
      <ProductForm
        product={product}
        categories={categories}
        isSuperAdmin={isSuperAdmin}
      />
      <ProductActivityLog entries={activityLog} />
    </>
  );
}
