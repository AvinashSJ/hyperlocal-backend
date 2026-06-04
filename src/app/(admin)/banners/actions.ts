"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertPermission } from "@/lib/require-permission";

type BannerInput = {
  name: string;
  link: string;
  image_url: string;
  position: number;
  is_active: boolean;
};

export async function getBanners(storeId?: string | null) {
  const supabase = createAdminClient();
  let query = supabase
    .from("banners")
    .select("*")
    .order("position", { ascending: true });
  if (storeId) query = query.eq("store_id", storeId);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function createBanner(formData: FormData) {
  await assertPermission("banners", "create");
  const supabase = createAdminClient();
  const data: BannerInput = {
    name: String(formData.get("name") ?? ""),
    link: String(formData.get("link") ?? ""),
    image_url: String(formData.get("image_url") ?? ""),
    position: Number(formData.get("position") ?? 0),
    is_active: formData.get("is_active") === "on" || formData.get("is_active") === "true",
  };
  if (!data.name) throw new Error("Banner name is required");

  const { error } = await supabase.from("banners").insert(data);
  if (error) throw new Error(error.message);
  revalidatePath("/banners");
}

export async function updateBanner(id: string, formData: FormData) {
  await assertPermission("banners", "edit");
  const supabase = createAdminClient();
  const data: BannerInput = {
    name: String(formData.get("name") ?? ""),
    link: String(formData.get("link") ?? ""),
    image_url: String(formData.get("image_url") ?? ""),
    position: Number(formData.get("position") ?? 0),
    is_active: formData.get("is_active") === "on" || formData.get("is_active") === "true",
  };
  if (!data.name) throw new Error("Banner name is required");

  const { error } = await supabase.from("banners").update(data).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/banners");
}

export async function deleteBanner(id: string) {
  await assertPermission("banners", "delete");
  const supabase = createAdminClient();
  const { error } = await supabase.from("banners").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/banners");
}

export async function reorderBanners(items: { id: string; position: number }[]) {
  await assertPermission("banners", "edit");
  const supabase = createAdminClient();
  for (const item of items) {
    const { error } = await supabase.from("banners").update({ position: item.position }).eq("id", item.id);
    if (error) throw new Error(error.message);
  }
  revalidatePath("/banners");
}
