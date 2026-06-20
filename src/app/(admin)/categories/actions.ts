"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertPermission } from "@/lib/require-permission";
import { logActivity } from "@/lib/activity-log";

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

  // P33: the simple delete path still works for categories that are
  // NOT pending deletion. The Postgres trigger
  // `trg_prevent_premature_category_delete` will block this if the
  // category has `pending_deletion_at` set and the grace period
  // hasn't expired.
  await supabase
    .from("categories")
    .update({ parent_id: null })
    .eq("parent_id", id);

  const { error } = await supabase.from("categories").delete().eq("id", id);

  if (error) throw new Error(error.message);

  revalidatePath("/categories");
}

// P33: Schedule a category for deletion. Sets `pending_deletion_at`
// to now(). The category remains in the DB for the configured grace
// period (default 30 days, configurable via
// `settings.category_deletion_grace_days`). The category is hidden
// from the public list immediately (the `is_active` flag is left
// alone — the row is still queryable but the UI shows a "scheduled
// for deletion" badge).
export async function requestCategoryDeletion(formData: FormData) {
  await assertPermission("categories", "delete");
  const supabase = createAdminClient();
  const id = formData.get("id") as string;
  if (!id) throw new Error("Category id is required");

  // Don't re-schedule if already pending.
  const { data: existing, error: fetchErr } = await supabase
    .from("categories")
    .select("pending_deletion_at")
    .eq("id", id)
    .single();
  if (fetchErr) throw new Error(fetchErr.message);
  if (existing?.pending_deletion_at) {
    throw new Error("Category is already scheduled for deletion");
  }

  const { error } = await supabase
    .from("categories")
    .update({ pending_deletion_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);

  await logActivity({
    action: "delete",
    entityType: "category",
    entityId: id,
    details: { action_type: "schedule_deletion" },
  });

  revalidatePath("/categories");
}

// P33: Cancel a pending deletion. Clears `pending_deletion_at`.
export async function cancelCategoryDeletion(formData: FormData) {
  await assertPermission("categories", "delete");
  const supabase = createAdminClient();
  const id = formData.get("id") as string;
  if (!id) throw new Error("Category id is required");

  const { error } = await supabase
    .from("categories")
    .update({ pending_deletion_at: null })
    .eq("id", id);
  if (error) throw new Error(error.message);

  await logActivity({
    action: "update",
    entityType: "category",
    entityId: id,
    details: { action_type: "cancel_deletion" },
  });

  revalidatePath("/categories");
}

// P33: Force-override option. Immediately unassign the category
// from every store (delete all `store_categories` rows). The
// category itself stays in the DB. SA can later reassign it to a
// new store via `reassignCategory`. Bypasses the grace period.
export async function forceUnassignCategory(formData: FormData) {
  await assertPermission("categories", "delete");
  const supabase = createAdminClient();
  const id = formData.get("id") as string;
  if (!id) throw new Error("Category id is required");

  // Clear pending_deletion_at first so the trigger doesn't block
  // any future delete during the same call. (The trigger blocks
  // deletes on rows where pending_deletion_at is set AND the grace
  // period hasn't expired; unassigning the category doesn't
  // delete it, so this is precautionary.)
  await supabase
    .from("categories")
    .update({ pending_deletion_at: null })
    .eq("id", id);

  const { error: delErr } = await supabase
    .from("store_categories")
    .delete()
    .eq("category_id", id);
  if (delErr) throw new Error(delErr.message);

  await logActivity({
    action: "update",
    entityType: "category",
    entityId: id,
    details: { action_type: "force_unassign_from_all_stores" },
  });

  revalidatePath("/categories");
}

// P33: Force delete (admin escape hatch). Clears
// pending_deletion_at first so the BEFORE DELETE trigger allows
// the delete even if the grace period hasn't expired. This is the
// SA escape hatch for "I really need this gone now".
export async function forceDeleteCategory(formData: FormData) {
  await assertPermission("categories", "delete");
  const supabase = createAdminClient();
  const id = formData.get("id") as string;
  if (!id) throw new Error("Category id is required");

  // Detach children from this parent
  await supabase
    .from("categories")
    .update({ parent_id: null })
    .eq("parent_id", id);

  // Clear pending_deletion_at so the trigger doesn't block the delete
  await supabase
    .from("categories")
    .update({ pending_deletion_at: null })
    .eq("id", id);

  const { error } = await supabase.from("categories").delete().eq("id", id);
  if (error) throw new Error(error.message);

  await logActivity({
    action: "delete",
    entityType: "category",
    entityId: id,
    details: { action_type: "force_delete" },
  });

  revalidatePath("/categories");
}

// P33: Reassign a category to a different store. Used after the
// category has been unassigned (either via the manager-disable
// cascade or via the force-override option above).
export async function reassignCategory(formData: FormData) {
  await assertPermission("categories", "edit");
  const supabase = createAdminClient();
  const categoryId = formData.get("category_id") as string;
  const toStoreId = formData.get("to_store_id") as string;
  if (!categoryId) throw new Error("Category id is required");
  if (!toStoreId) throw new Error("Target store id is required");

  // Insert a fresh store_categories row. Use upsert to be safe if
  // the row somehow already exists.
  const { error } = await supabase
    .from("store_categories")
    .upsert(
      { store_id: toStoreId, category_id: categoryId },
      { onConflict: "store_id,category_id" },
    );
  if (error) throw new Error(error.message);

  // If the category is currently scheduled for deletion, the
  // reassignment effectively un-schedules it (the SA has decided
  // to keep it by giving it a home).
  await supabase
    .from("categories")
    .update({ pending_deletion_at: null })
    .eq("id", categoryId);

  await logActivity({
    action: "update",
    entityType: "category",
    entityId: categoryId,
    details: { action_type: "reassign", toStoreId },
  });

  revalidatePath("/categories");
  revalidatePath("/stores");
}
