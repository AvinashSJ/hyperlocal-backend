import { createAdminClient } from "@/lib/supabase/admin";
import ProductForm from "../ProductForm";

async function getCategories() {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("categories")
    .select("id, name")
    .eq("is_active", true)
    .order("name");
  return data ?? [];
}

export default async function NewProductPage() {
  const categories = await getCategories();

  return <ProductForm product={null} categories={categories} />;
}
