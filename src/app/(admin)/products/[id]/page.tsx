import { notFound, redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import ProductForm from "../ProductForm";

type Props = {
  params: Promise<{ id: string }>;
};

async function getProduct(id: string) {
  const supabase = createAdminClient();

  const { data: product } = await supabase
    .from("products")
    .select("*")
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

async function getCategories(storeId?: string | null) {
  const supabase = createAdminClient();
  let query = supabase
    .from("categories")
    .select("id, name")
    .eq("is_active", true)
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

export default async function EditProductPage({ params }: Props) {
  const { id } = await params;
  const product = await getProduct(id);

  if (!product) notFound();

  const categories = await getCategories(product.store_id);

  return <ProductForm product={product} categories={categories} />;
}
