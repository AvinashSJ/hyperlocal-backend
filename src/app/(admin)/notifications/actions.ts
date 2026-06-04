"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertPermission } from "@/lib/require-permission";

type NotificationInput = {
  user_id: string;
  title: string;
  body: string;
  type: string;
};

export async function getNotifications() {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("notifications")
    .select("*, profiles(full_name, email)")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function createNotification(formData: FormData) {
  await assertPermission("notifications", "create");
  const supabase = createAdminClient();
  const data: NotificationInput = {
    user_id: String(formData.get("user_id") ?? ""),
    title: String(formData.get("title") ?? ""),
    body: String(formData.get("body") ?? ""),
    type: String(formData.get("type") ?? ""),
  };
  if (!data.title) throw new Error("Notification title is required");
  if (!data.user_id) throw new Error("User ID is required");

  const { error } = await supabase.from("notifications").insert(data);
  if (error) throw new Error(error.message);
  revalidatePath("/notifications");
}

export async function deleteNotification(id: string) {
  await assertPermission("notifications", "delete");
  const supabase = createAdminClient();
  const { error } = await supabase.from("notifications").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/notifications");
}
