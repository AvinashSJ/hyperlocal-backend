"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertPermission, PermissionError } from "@/lib/require-permission";
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

  // P50: capture identifying fields + scheduling state BEFORE the
  // delete. `was_pending` tells the auditor whether the delete
  // happened after the grace period (normal flow) or whether the
  // trigger allowed an immediate delete (operator override).
  const { data: catRow } = await supabase
    .from("categories")
    .select("name, pending_deletion_at")
    .eq("id", id)
    .maybeSingle();
  const categoryName = catRow?.name ?? null;
  const wasPending = Boolean(catRow?.pending_deletion_at);

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

  await logActivity({
    action: "delete",
    entityType: "category",
    entityId: id,
    details: {
      action_type: wasPending ? "scheduled_delete" : "direct_delete",
      name: categoryName,
    },
  });

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

/**
 * P45: List products in a category (and its descendants) that have a
 * store assigned — i.e., "which store is catering this product". Used
 * by the Super Admin's drill-down on the categories page.
 *
 * Why Super Admin only: managers already see their own products in the
 * /products page, and this view is the "global" view across stores.
 * Exposing it to managers would leak the products of other stores
 * they're scoped away from. Super Admin needs the cross-store view to
 * review which stores cater which products per category.
 *
 * @param categoryId  the clicked category (a parent click includes
 *                    products in all descendant subcategories)
 * @param page        1-indexed page number
 * @param pageSize    default 10 (per the spec)
 * @param search      ilike filter on name + sku
 */
export type StoreProductRow = {
  id: string;
  name: string;
  sku: string | null;
  status: "active" | "inactive" | "out_of_stock";
  store_id: string;
  stores: { name: string; code: string } | null;
};

export type StoreProductsResult = {
  products: StoreProductRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export async function getStoreProductsForCategory(
  categoryId: string,
  page: number = 1,
  pageSize: number = 10,
  search: string = "",
): Promise<StoreProductsResult> {
  const result = await assertPermission("categories", "view");
  if (!result.isSuperAdmin) {
    throw new PermissionError("categories", "view");
  }

  if (!categoryId) {
    throw new Error("categoryId is required");
  }

  const supabase = createAdminClient();

  // Walk the categories tree to find all descendants of the clicked
  // category. The categories table is small (usually <500 rows) so a
  // single fetch + in-memory walk is simpler and faster than a
  // recursive CTE.
  const { data: allCategories } = await supabase
    .from("categories")
    .select("id, parent_id");

  const childrenByParent = new Map<string, string[]>();
  const allIds = new Set<string>();
  for (const c of allCategories ?? []) {
    allIds.add(c.id);
    if (c.parent_id) {
      const list = childrenByParent.get(c.parent_id) ?? [];
      list.push(c.id);
      childrenByParent.set(c.parent_id, list);
    }
  }

  const targetIds = new Set<string>();
  if (allIds.has(categoryId)) {
    targetIds.add(categoryId);
    const stack = [categoryId];
    while (stack.length > 0) {
      const current = stack.pop()!;
      const children = childrenByParent.get(current) ?? [];
      for (const child of children) {
        if (!targetIds.has(child)) {
          targetIds.add(child);
          stack.push(child);
        }
      }
    }
  }

  if (targetIds.size === 0) {
    return { products: [], total: 0, page, pageSize, totalPages: 0 };
  }

  const idsArray = Array.from(targetIds);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let baseQuery = supabase
    .from("products")
    .select(
      "id, name, sku, status, store_id, stores!products_store_id_fkey(name, code)",
      { count: "exact" },
    )
    .in("category_id", idsArray)
    .not("store_id", "is", null)
    .order("name", { ascending: true })
    .range(from, to);

  if (search && search.trim()) {
    const escaped = search.trim().replace(/[%_]/g, "\\$&");
    const pattern = `%${escaped}%`;
    baseQuery = baseQuery.or(`name.ilike.${pattern},sku.ilike.${pattern}`);
  }

  const { data, count, error } = await baseQuery;
  if (error) throw new Error(error.message);

  const total = count ?? 0;
  const totalPages = total === 0 ? 0 : Math.ceil(total / pageSize);

  return {
    products: (data ?? []) as unknown as StoreProductRow[],
    total,
    page,
    pageSize,
    totalPages,
  };
}
