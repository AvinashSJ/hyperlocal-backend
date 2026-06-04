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

async function getCategories() {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("categories")
    .select("id, name")
    .eq("is_active", true)
    .order("name");
  return data ?? [];
}

export default async function EditProductPage({ params }: Props) {
  const { id } = await params;
  const [product, categories] = await Promise.all([
    getProduct(id),
    getCategories(),
  ]);

  if (!product) notFound();

  return <ProductForm product={product} categories={categories} />;
}
