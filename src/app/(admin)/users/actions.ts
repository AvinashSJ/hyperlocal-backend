"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import { assertPermission } from "@/lib/require-permission";

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

export async function updateUserRole(formData: FormData) {
  await assertPermission("users", "edit");
  const supabase = createAdminClient();
  const id = formData.get("id") as string;
  const roleId = formData.get("role_id") as string;

  if (roleId === "customer") {
    const { error } = await supabase
      .from("profiles")
      .update({ role_id: null, role: "customer" })
      .eq("id", id);

    if (error) console.error("Failed to demote to customer:", error);
    revalidatePath("/users");
    revalidatePath("/customers");
    return;
  }

  // Sync the `role` string with the new `role_id` so segmentation stays correct
  const { data: roleData } = await supabase
    .from("roles")
    .select("name")
    .eq("id", Number(roleId))
    .single();

  const role: "admin" | "superadmin" =
    roleData?.name === "Super Admin" ? "superadmin" : "admin";

  const { error } = await supabase
    .from("profiles")
    .update({ role_id: Number(roleId), role })
    .eq("id", id);

  if (error) console.error("Failed to update role:", error);
  revalidatePath("/users");
  revalidatePath("/staff");
  revalidatePath("/customers");
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

  const update: Record<string, unknown> = {
    full_name: fullName || null,
    phone: phone || null,
  };

  if (email) update.email = email;
  update.store_id = storeId || null;

  const { error } = await supabase
    .from("profiles")
    .update(update)
    .eq("id", id);

  if (error) throw new Error(error.message);
  revalidatePath("/users");
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
