"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import { assertPermission } from "@/lib/require-permission";

export type RoleRow = {
  id: number;
  name: string;
  description: string | null;
  permissions: Record<string, string[]>;
  is_system: boolean;
  created_at: string;
  userCount: number;
};

export async function getRoles(): Promise<RoleRow[]> {
  const supabase = createAdminClient();

  const { data: roles, error } = await supabase
    .from("roles")
    .select("id, name, description, permissions, is_system, created_at")
    .order("id");

  if (error || !roles) {
    console.error("Failed to fetch roles:", error);
    return [];
  }

  const roleIds = roles.map((r) => r.id);

  const { data: counts } = await supabase
    .from("profiles")
    .select("role_id")
    .in("role_id", roleIds);

  const countMap = new Map<number, number>();
  for (const row of counts ?? []) {
    const rid = Number(row.role_id);
    countMap.set(rid, (countMap.get(rid) ?? 0) + 1);
  }

  return roles.map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    permissions: r.permissions as Record<string, string[]>,
    is_system: r.is_system,
    created_at: r.created_at,
    userCount: countMap.get(r.id) ?? 0,
  }));
}

export async function createRole(formData: FormData) {
  await assertPermission("roles", "create");
  const supabase = createAdminClient();
  const name = formData.get("name") as string;
  const description = (formData.get("description") as string) || null;

  let permissions: Record<string, string[]> = {};
  try {
    const raw = formData.get("permissions") as string;
    if (raw) permissions = JSON.parse(raw);
  } catch {
    console.error("Invalid permissions JSON");
  }

  const { error } = await supabase.from("roles").insert({
    name,
    description,
    permissions,
    is_system: false,
  });

  if (error) {
    console.error("Failed to create role:", error);
    throw new Error(error.message);
  }
  revalidatePath("/roles");
}

export async function updateRole(formData: FormData) {
  await assertPermission("roles", "edit");
  const supabase = createAdminClient();
  const id = Number(formData.get("id"));
  const name = formData.get("name") as string;
  const description = (formData.get("description") as string) || null;

  let permissions: Record<string, string[]> = {};
  try {
    const raw = formData.get("permissions") as string;
    if (raw) permissions = JSON.parse(raw);
  } catch {
    console.error("Invalid permissions JSON");
  }

  const { error } = await supabase
    .from("roles")
    .update({ name, description, permissions })
    .eq("id", id);

  if (error) {
    console.error("Failed to update role:", error);
    throw new Error(error.message);
  }
  revalidatePath("/roles");
}

export async function deleteRole(formData: FormData) {
  await assertPermission("roles", "delete");
  const supabase = createAdminClient();
  const id = Number(formData.get("id"));

  const { count } = await supabase
    .from("profiles")
    .select("*", { count: "exact", head: true })
    .eq("role_id", id);

  if (count && count > 0) {
    throw new Error(`Cannot delete role with ${count} assigned user(s). Reassign them first.`);
  }

  const { error } = await supabase.from("roles").delete().eq("id", id);

  if (error) {
    console.error("Failed to delete role:", error);
    throw new Error(error.message);
  }
  revalidatePath("/roles");
}
