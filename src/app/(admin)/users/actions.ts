"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { assertPermission } from "@/lib/require-permission";
import { logActivity } from "@/lib/activity-log";

export type UserRow = {
  id: string;
  email: string | null;
  phone: string | null;
  full_name: string | null;
  avatar_url: string | null;
  role: string;
  role_id: number | null;
  role_name: string | null;
  is_active: boolean;
  created_at: string;
  orderCount: number;
  store_id: string | null;
  store_name: string | null;
};

export type SimpleRole = {
  id: number;
  name: string;
};

export type SimpleStore = {
  id: string;
  name: string;
};

export async function getRoles(): Promise<SimpleRole[]> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("roles")
    .select("id, name")
    .order("id");
  return (data ?? []) as SimpleRole[];
}

export async function getStoresLight(): Promise<SimpleStore[]> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("stores")
    .select("id, name")
    .order("name");
  return (data ?? []) as SimpleStore[];
}

export async function getUsers(roleFilter?: string): Promise<UserRow[]> {
  const supabase = createAdminClient();

  // Exclude Staff role_id from the admin users list — staff live on /staff
  const { data: staffRole } = await supabase
    .from("roles")
    .select("id")
    .eq("name", "Staff")
    .maybeSingle();

  let query = supabase
    .from("profiles")
    .select("id, email, phone, full_name, avatar_url, role, role_id, is_active, created_at, store_id")
    .neq("role", "customer");

  if (staffRole) {
    query = query.neq("role_id", staffRole.id);
  }

  if (roleFilter && roleFilter !== "all") {
    if (["customer", "admin", "superadmin"].includes(roleFilter)) {
      query = query.eq("role", roleFilter);
    } else {
      const roleId = Number(roleFilter);
      if (!isNaN(roleId)) {
        query = query.eq("role_id", roleId);
      }
    }
  }

  const { data: profiles, error } = await query;

  if (error || !profiles) {
    console.error("Failed to fetch profiles:", error);
    return [];
  }

  const userIds = profiles.map((p) => p.id);

  const { data: orderCounts } = await supabase
    .from("orders")
    .select("user_id")
    .in("user_id", userIds);

  const orderCountMap = new Map<string, number>();
  for (const row of orderCounts ?? []) {
    orderCountMap.set(row.user_id, (orderCountMap.get(row.user_id) ?? 0) + 1);
  }

  const roleIds = [...new Set(profiles.map((p) => p.role_id).filter(Boolean))] as number[];
  const roleNameMap = new Map<number, string>();
  if (roleIds.length > 0) {
    const { data: roleData } = await supabase
      .from("roles")
      .select("id, name")
      .in("id", roleIds);
    for (const r of roleData ?? []) {
      roleNameMap.set(r.id, r.name);
    }
  }

  const storeIds = [...new Set(profiles.map((p) => p.store_id).filter(Boolean))] as string[];
  const storeNameMap = new Map<string, string>();
  if (storeIds.length > 0) {
    const { data: storeData } = await supabase
      .from("stores")
      .select("id, name")
      .in("id", storeIds);
    for (const s of storeData ?? []) {
      storeNameMap.set(s.id, s.name);
    }
  }

  return profiles.map((p) => ({
    id: p.id,
    email: p.email ?? null,
    phone: p.phone ?? null,
    full_name: p.full_name ?? null,
    avatar_url: p.avatar_url ?? null,
    role: p.role,
    role_id: p.role_id,
    role_name: p.role_id ? (roleNameMap.get(p.role_id) ?? null) : null,
    is_active: p.is_active ?? true,
    created_at: p.created_at,
    orderCount: orderCountMap.get(p.id) ?? 0,
    store_id: p.store_id ?? null,
    store_name: p.store_id ? (storeNameMap.get(p.store_id) ?? null) : null,
  }));
}

export async function toggleUserActive(formData: FormData) {
  await assertPermission("users", "edit");
  const supabase = createAdminClient();
  const id = formData.get("id") as string;
  const current = formData.get("current") === "true";

  const { error } = await supabase
    .from("profiles")
    .update({ is_active: !current })
    .eq("id", id);

  if (error) console.error("Failed to toggle active:", error);
  revalidatePath("/users");
}

// P33: Toggle a Manager (store-scoped admin) with cascade. Distinct
// from `toggleUserActive` so we don't accidentally cascade-disable
// Super Admins or other non-Manager users.
//
// Cascade rules on disable (targetActive = false):
//   1. Products in the manager's store → status = 'inactive'
//      (skipped for products with cascade_locked = false; Super Admin
//      can flip that flag in the product edit form to force-keep
//      a product active even when the manager is disabled)
//   2. Categories in the manager's store → DELETE the
//      `store_categories` row (unassign, do NOT mark the category
//      globally inactive — the category stays alive and is available
//      for SA to reassign to another store)
//
// On re-enable (targetActive = true): NO auto-restore. Disabled
// products stay inactive; unassigned categories stay unassigned.
// Manager / SA must re-enable products and reassign categories
// individually. This is a deliberate "no surprises on re-enable"
// decision.
export async function toggleManagerActiveWithCascade(
  formData: FormData,
): Promise<{
  ok: boolean;
  cascaded: boolean;
  productsDisabled: number;
  categoriesUnassigned: number;
}> {
  await assertPermission("users", "edit");
  const supabase = createAdminClient();

  const id = formData.get("id") as string;
  const targetActive = formData.get("target") === "true";

  if (!id) throw new Error("User id is required");

  // 1. Look up the target user. We need role + store_id + roles(name).
  const { data: target, error: targetErr } = await supabase
    .from("profiles")
    .select("id, role_id, store_id, is_active, roles(name)")
    .eq("id", id)
    .single();

  if (targetErr || !target) {
    throw new Error(targetErr?.message ?? "User not found");
  }

  const roleName = (target as { roles?: { name?: string } | null }).roles?.name;
  if (roleName !== "Manager") {
    // Only cascade for Manager-role users. Other roles use the
    // simpler `toggleUserActive` action.
    throw new Error(
      "Cascade is only available for Manager role. Use toggleUserActive for other roles.",
    );
  }

  // 2. Update the profile's is_active to the target state.
  const { error: updateErr } = await supabase
    .from("profiles")
    .update({ is_active: targetActive })
    .eq("id", id);
  if (updateErr) throw new Error(updateErr.message);

  // 3. If disabling, run the cascade.
  let productsDisabled = 0;
  let categoriesUnassigned = 0;
  if (!targetActive && target.store_id) {
    // Products: set status = 'inactive' for products in this store,
    // EXCEPT those with cascade_locked = false.
    const { data: updatedProducts, error: prodErr } = await supabase
      .from("products")
      .update({ status: "inactive" })
      .eq("store_id", target.store_id)
      .eq("cascade_locked", true)
      .neq("status", "inactive")
      .select("id");
    if (prodErr) {
      console.error("Failed to cascade-disable products:", prodErr);
    } else {
      productsDisabled = updatedProducts?.length ?? 0;
    }

    // Categories: delete the store_categories rows for this store.
    // The categories themselves stay `is_active = true` globally
    // (the only effect is they're no longer assigned to this store).
    const { data: deletedCats, error: catErr } = await supabase
      .from("store_categories")
      .delete()
      .eq("store_id", target.store_id)
      .select("category_id");
    if (catErr) {
      console.error("Failed to unassign store categories:", catErr);
    } else {
      categoriesUnassigned = deletedCats?.length ?? 0;
    }
  }

  // 4. Activity log entry (best-effort, never blocks the action).
  await logActivity({
    action: "update",
    entityType: "manager_active_cascade",
    entityId: id,
    details: {
      targetActive,
      storeId: target.store_id,
      productsDisabled,
      categoriesUnassigned,
    },
  });

  revalidatePath("/users");
  revalidatePath("/products");
  revalidatePath("/categories");
  revalidatePath("/stores");

  return {
    ok: true,
    cascaded: !targetActive && !!target.store_id,
    productsDisabled,
    categoriesUnassigned,
  };
}

export async function deleteUser(formData: FormData) {
  await assertPermission("users", "delete");
  const supabase = createAdminClient();
  const id = formData.get("id") as string;

  const { error } = await supabase.from("profiles").delete().eq("id", id);

  if (error) console.error("Failed to delete user:", error);
  revalidatePath("/users");
}

export async function updateUser(formData: FormData) {
  await assertPermission("users", "edit");
  const supabase = createAdminClient();
  const id = formData.get("id") as string;
  const fullName = (formData.get("full_name") as string | null)?.trim() ?? "";
  const email = (formData.get("email") as string | null)?.trim() ?? "";
  const phone = (formData.get("phone") as string | null)?.trim() ?? "";
  const storeId = (formData.get("store_id") as string | null)?.trim() ?? "";
  const roleIdRaw = (formData.get("role_id") as string | null) ?? "";

  const update: Record<string, unknown> = {
    full_name: fullName || null,
    phone: phone || null,
  };

  if (email) update.email = email;
  update.store_id = storeId || null;

  // P30: role change is now handled here (was updateUserRole, removed).
  // Two hard safety gates: cannot change a Super Admin's role, and
  // cannot change your own role. The UI disables the field for these
  // cases too — this is defense in depth.
  if (roleIdRaw) {
    // Use the server client for auth.getUser() (mirrors
    // commissions/actions.ts:resolveUserId). The admin client uses
    // the service-role key and has no user context.
    let currentUserId: string | null = null;
    try {
      const supabaseServer = await createClient();
      const { data: { user } } = await supabaseServer.auth.getUser();
      currentUserId = user?.id ?? null;
    } catch {
      currentUserId = null;
    }
    if (currentUserId && currentUserId === id) {
      throw new Error("You cannot change your own role");
    }

    const { data: target } = await supabase
      .from("profiles")
      .select("role_id, roles(name)")
      .eq("id", id)
      .single();

    if (target && (target as { roles?: { name?: string } | null }).roles?.name === "Super Admin") {
      throw new Error("Super Admin role cannot be changed");
    }

    if (roleIdRaw === "customer") {
      update.role_id = null;
      update.role = "customer";
    } else {
      const roleId = Number(roleIdRaw);
      if (!isNaN(roleId)) {
        const { data: roleData } = await supabase
          .from("roles")
          .select("name")
          .eq("id", roleId)
          .single();
        update.role_id = roleId;
        update.role = roleData?.name === "Super Admin" ? "superadmin" : "admin";
      }
    }
  }

  const { error } = await supabase
    .from("profiles")
    .update(update)
    .eq("id", id);

  if (error) throw new Error(error.message);

  // If the role changed, revalidate the role-aware pages so the
  // sidebar / nav reflects the new permissions.
  if (roleIdRaw) {
    revalidatePath("/users");
    revalidatePath("/staff");
    revalidatePath("/customers");
  }
}

export async function createUser(formData: FormData) {
  await assertPermission("users", "create");
  const supabase = createAdminClient();

  const email = formData.get("email") as string;
  const password = formData.get("password") as string;
  const fullName = formData.get("full_name") as string;
  const phone = formData.get("phone") as string;
  const roleId = formData.get("role_id") as string;
  const storeId = formData.get("store_id") as string;

  if (!email || !password) throw new Error("Email and password are required");
  if (!roleId) throw new Error("Role is required");

  const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });

  if (authError) throw new Error(authError.message);

  // Look up the role name to derive the `role` string used for segmentation
  // (admin vs customer). Without this, the column defaults to 'customer'
  // and the user gets misclassified.
  const { data: roleData } = await supabase
    .from("roles")
    .select("name")
    .eq("id", Number(roleId))
    .single();

  const role: "admin" | "superadmin" =
    roleData?.name === "Super Admin" ? "superadmin" : "admin";

  const profileData: Record<string, unknown> = {
    id: authUser.user.id,
    email,
    full_name: fullName || null,
    phone: phone || null,
    role,
    role_id: Number(roleId),
    is_active: true,
  };

  if (storeId) profileData.store_id = storeId;

  const { error: profileError } = await supabase
    .from("profiles")
    .insert(profileData);

  if (profileError) {
    await supabase.auth.admin.deleteUser(authUser.user.id);
    throw new Error(profileError.message);
  }

  revalidatePath("/users");
}

// P31: Reset a user's password (admin action).
// Sets a new temporary password via auth.admin.updateUserById and
// flags the profile with must_reset_password = true. On the user's
// next sign-in, the login flow redirects them to /auth/reset-password
// where they set a permanent password.
export async function resetUserPassword(formData: FormData) {
  await assertPermission("users", "edit");
  const supabase = createAdminClient();

  const id = formData.get("id") as string;
  const newPassword = formData.get("new_password") as string;

  if (!id) throw new Error("User id is required");
  if (!newPassword) throw new Error("New password is required");
  if (newPassword.length < 6) {
    throw new Error("Password must be at least 6 characters");
  }

  // Use the server client to fetch the current user's id for the
  // self-edit safety check (mirrors the updateUser role check).
  let currentUserId: string | null = null;
  try {
    const supabaseServer = await createClient();
    const { data: { user } } = await supabaseServer.auth.getUser();
    currentUserId = user?.id ?? null;
  } catch {
    currentUserId = null;
  }

  if (currentUserId && currentUserId === id) {
    throw new Error("Use /auth/reset-password to change your own password");
  }

  // Update the auth.users password. email_confirm: true so the user
  // can sign in immediately with the temporary password.
  const { error: authError } = await supabase.auth.admin.updateUserById(id, {
    password: newPassword,
    email_confirm: true,
  });
  if (authError) throw new Error(authError.message);

  // Mark the profile so the next login forces a password setup.
  const { error: profileError } = await supabase
    .from("profiles")
    .update({ must_reset_password: true })
    .eq("id", id);
  if (profileError) throw new Error(profileError.message);

  revalidatePath("/users");
}
