"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import { assertPermission } from "@/lib/require-permission";

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

export async function getStaff(storeId?: string | null): Promise<StaffRow[]> {
  await assertPermission("staff", "view");
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
  await assertPermission("staff", "create");
  const supabase = createAdminClient();

  const fullName = formData.get("full_name") as string;
  const phone = formData.get("phone") as string;
  const staffType = formData.get("staff_type") as string;
  const storeId = formData.get("store_id") as string;

  if (!fullName) throw new Error("Name is required");

  const { data: staffRole } = await supabase
    .from("roles")
    .select("id")
    .eq("name", "Staff")
    .single();

  if (!staffRole) throw new Error("Staff role not found");

  const { error } = await supabase.from("profiles").insert({
    full_name: fullName,
    phone: phone || null,
    staff_type: staffType || null,
    store_id: storeId || null,
    role_id: staffRole.id,
    role: "staff",
    is_active: true,
  });

  if (error) throw new Error(error.message);

  revalidatePath("/staff");
}

export async function updateStaff(formData: FormData) {
  await assertPermission("staff", "edit");
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
  await assertPermission("staff", "edit");
  const supabase = createAdminClient();

  const id = formData.get("id") as string;
  const current = formData.get("current") === "true";

  const { error } = await supabase.from("profiles").update({ is_active: !current }).eq("id", id);

  if (error) console.error("Failed to toggle active:", error);
  revalidatePath("/staff");
}

export async function deleteStaff(formData: FormData) {
  await assertPermission("staff", "delete");
  const supabase = createAdminClient();

  const id = formData.get("id") as string;

  const { error } = await supabase.from("profiles").delete().eq("id", id);

  if (error) throw new Error(error.message);
  revalidatePath("/staff");
}
