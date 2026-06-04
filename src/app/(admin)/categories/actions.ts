"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertPermission } from "@/lib/require-permission";

export async function createCategory(formData: FormData) {
  await assertPermission("categories", "create");
  const supabase = createAdminClient();

  const name = String(formData.get("name") ?? "");
  const description = String(formData.get("description") ?? "");
  const imageUrl = String(formData.get("image_url") ?? "");
  const parentId = String(formData.get("parent_id") ?? "");
  const sortOrder = Number(formData.get("sort_order") ?? 0);
  const isFeatured = formData.get("is_featured") === "on";
  const isActive = formData.get("is_active") !== "off";
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  const { error } = await supabase.from("categories").insert({
    name,
    slug,
    description: description || null,
    image_url: imageUrl || null,
    parent_id: parentId || null,
    sort_order: sortOrder,
    is_featured: isFeatured,
    is_active: isActive,
  });

  if (error) throw new Error(error.message);

  revalidatePath("/categories");
  redirect("/categories");
}

export async function updateCategory(id: string, formData: FormData) {
  await assertPermission("categories", "edit");
  const supabase = createAdminClient();

  const name = String(formData.get("name") ?? "");
  const description = String(formData.get("description") ?? "");
  const imageUrl = String(formData.get("image_url") ?? "");
  const parentId = String(formData.get("parent_id") ?? "");
  const sortOrder = Number(formData.get("sort_order") ?? 0);
  const isFeatured = formData.get("is_featured") === "on";
  const isActive = formData.get("is_active") !== "off";
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  const { error } = await supabase
    .from("categories")
    .update({
      name,
      slug,
      description: description || null,
      image_url: imageUrl || null,
      parent_id: parentId || null,
      sort_order: sortOrder,
      is_featured: isFeatured,
      is_active: isActive,
    })
    .eq("id", id);

  if (error) throw new Error(error.message);

  revalidatePath("/categories");
  redirect("/categories");
}

export async function deleteCategory(id: string) {
  await assertPermission("categories", "delete");
  const supabase = createAdminClient();

  await supabase
    .from("categories")
    .update({ parent_id: null })
    .eq("parent_id", id);

  const { error } = await supabase.from("categories").delete().eq("id", id);

  if (error) throw new Error(error.message);

  revalidatePath("/categories");
}
