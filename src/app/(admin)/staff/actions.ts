"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import { assertPermission, PermissionError } from "@/lib/require-permission";

export type StaffRow = {
  id: string;
  full_name: string | null;
  phone: string | null;
  staff_type: string | null;
  is_active: boolean;
  created_at: string;
  store_id: string | null;
  store_name: string | null;
};

export type SimpleStore = {
  id: string;
  name: string;
};

export async function getStoresLight(): Promise<SimpleStore[]> {
  const supabase = createAdminClient();
  const { data } = await supabase.from("stores").select("id, name").order("name");
  return (data ?? []) as SimpleStore[];
}

/**
 * P28: throw PermissionError when a Super Admin tries to call a staff
 * action. The /staff module is for store managers — Super Admins can
 * create staff via the /users page (users/actions.ts:createUser creates
 * a real auth user with any role).
 */
function assertNotSuperAdmin(
  result: { isSuperAdmin: boolean },
  action: string,
): void {
  if (result.isSuperAdmin) {
    throw new PermissionError("staff", action);
  }
}

export async function getStaff(storeId?: string | null): Promise<StaffRow[]> {
  const result = await assertPermission("staff", "view");
  assertNotSuperAdmin(result, "view");
  const supabase = createAdminClient();

  const { data: staffRole } = await supabase
    .from("roles")
    .select("id")
    .eq("name", "Staff")
    .single();

  if (!staffRole) return [];

  let query = supabase
    .from("profiles")
    .select("id, full_name, phone, staff_type, is_active, created_at, store_id")
    .eq("role_id", staffRole.id);

  if (storeId) {
    query = query.eq("store_id", storeId);
  }

  const { data: profiles, error } = await query.order("created_at", { ascending: false });

  if (error || !profiles) {
    console.error("Failed to fetch staff:", error);
    return [];
  }

  const storeIds = [...new Set(profiles.map((p) => p.store_id).filter(Boolean))] as string[];
  const storeNameMap = new Map<string, string>();
  if (storeIds.length > 0) {
    const { data: storeData } = await supabase.from("stores").select("id, name").in("id", storeIds);
    for (const s of storeData ?? []) {
      storeNameMap.set(s.id, s.name);
    }
  }

  return profiles.map((p) => ({
    id: p.id,
    full_name: p.full_name ?? null,
    phone: p.phone ?? null,
    staff_type: p.staff_type ?? null,
    is_active: p.is_active ?? true,
    created_at: p.created_at,
    store_id: p.store_id ?? null,
    store_name: p.store_id ? (storeNameMap.get(p.store_id) ?? null) : null,
  }));
}

export async function createStaff(formData: FormData) {
  const result = await assertPermission("staff", "create");
  assertNotSuperAdmin(result, "create");
  const supabase = createAdminClient();

  const fullName = formData.get("full_name") as string;
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;
  const phone = formData.get("phone") as string;
  const staffType = formData.get("staff_type") as string;
  const storeId = formData.get("store_id") as string;

  if (!fullName) throw new Error("Name is required");
  if (!email || !password) throw new Error("Email and password are required");

  // The profiles row's `id` is a UUID that REFERENCES auth.users(id) (the
  // table is created by Supabase's standard pattern). Without first
  // creating the auth user, the insert fails with a foreign-key
  // violation or NOT NULL violation. Same flow as users/actions.ts:
  // createUser — create auth user first, then insert the profile row
  // with id = authUser.user.id.
  const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });

  if (authError) {
    throw new Error(authError.message);
  }

  const { data: staffRole } = await supabase
    .from("roles")
    .select("id")
    .eq("name", "Staff")
    .single();

  if (!staffRole) {
    // Roll back the auth user we just created so we don't leave an
    // orphan auth account that can't log in to anything.
    await supabase.auth.admin.deleteUser(authUser.user.id);
    throw new Error("Staff role not found");
  }

  const { error } = await supabase.from("profiles").insert({
    id: authUser.user.id,
    email,
    full_name: fullName,
    phone: phone || null,
    staff_type: staffType || null,
    store_id: storeId || null,
    role_id: staffRole.id,
    role: "admin",
    is_active: true,
  });

  if (error) {
    // Roll back the auth user so we don't leave an orphan auth account
    // paired with a profile that was never created.
    await supabase.auth.admin.deleteUser(authUser.user.id);
    throw new Error(error.message);
  }

  revalidatePath("/staff");
}

export async function updateStaff(formData: FormData) {
  const result = await assertPermission("staff", "edit");
  assertNotSuperAdmin(result, "edit");
  const supabase = createAdminClient();

  const id = formData.get("id") as string;
  const fullName = formData.get("full_name") as string;
  const phone = formData.get("phone") as string;
  const staffType = formData.get("staff_type") as string;
  const storeId = formData.get("store_id") as string;

  const updateData: Record<string, unknown> = {};
  if (fullName) updateData.full_name = fullName;
  updateData.phone = phone || null;
  updateData.staff_type = staffType || null;
  if (storeId) updateData.store_id = storeId;

  const { error } = await supabase.from("profiles").update(updateData).eq("id", id);

  if (error) throw new Error(error.message);
  revalidatePath("/staff");
}

export async function toggleStaffActive(formData: FormData) {
  const result = await assertPermission("staff", "edit");
  assertNotSuperAdmin(result, "edit");
  const supabase = createAdminClient();

  const id = formData.get("id") as string;
  const current = formData.get("current") === "true";

  const { error } = await supabase.from("profiles").update({ is_active: !current }).eq("id", id);

  if (error) console.error("Failed to toggle active:", error);
  revalidatePath("/staff");
}

export async function deleteStaff(formData: FormData) {
  const result = await assertPermission("staff", "delete");
  assertNotSuperAdmin(result, "delete");
  const supabase = createAdminClient();

  const id = formData.get("id") as string;

  const { error } = await supabase.from("profiles").delete().eq("id", id);

  if (error) throw new Error(error.message);
  revalidatePath("/staff");
}

// P31: Reset a staff member's password (admin action).
// Mirrors resetUserPassword but lives in the staff module. Same
// flow: set a temporary password via auth.admin.updateUserById and
// flag must_reset_password = true.
export async function resetStaffPassword(formData: FormData) {
  const result = await assertPermission("staff", "edit");
  assertNotSuperAdmin(result, "edit");
  const supabase = createAdminClient();

  const id = formData.get("id") as string;
  const newPassword = formData.get("new_password") as string;

  if (!id) throw new Error("Staff id is required");
  if (!newPassword) throw new Error("New password is required");
  if (newPassword.length < 6) {
    throw new Error("Password must be at least 6 characters");
  }

  const { error: authError } = await supabase.auth.admin.updateUserById(id, {
    password: newPassword,
    email_confirm: true,
  });
  if (authError) throw new Error(authError.message);

  const { error: profileError } = await supabase
    .from("profiles")
    .update({ must_reset_password: true })
    .eq("id", id);
  if (profileError) throw new Error(profileError.message);

  revalidatePath("/staff");
}
