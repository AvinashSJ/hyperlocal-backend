import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { PermissionModule, PermissionAction, RolePermissions } from "@/lib/permissions";
import { canAccess } from "@/lib/permissions";

export class PermissionError extends Error {
  module: string;
  action: string;
  constructor(module: string, action: string) {
    super(`Permission denied: ${action} on ${module}`);
    this.name = "PermissionError";
    this.module = module;
    this.action = action;
  }
}

export type PermissionResult = {
  permissions: RolePermissions;
  role: string;
  isSuperAdmin: boolean;
  storeId: string | null;
};

async function fetchPermissions(): Promise<PermissionResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { permissions: {}, role: "", isSuperAdmin: false, storeId: null };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, role_id, store_id")
    .eq("id", user.id)
    .single();

  let permissions: RolePermissions = {};
  let role = profile?.role ?? "admin";
  const storeId = profile?.store_id ?? null;

  if (profile?.role_id) {
    const adminSupabase = createAdminClient();
    const { data: roleData } = await adminSupabase
      .from("roles")
      .select("name, permissions")
      .eq("id", profile.role_id)
      .single();

    if (roleData) {
      role = roleData.name;
      if (roleData.permissions) {
        permissions = roleData.permissions as RolePermissions;
      }
    }
  }

  return { permissions, role, isSuperAdmin: role === "Super Admin", storeId };
}

export async function requirePermission(
  module: PermissionModule,
  action: PermissionAction = "view",
): Promise<PermissionResult> {
  const result = await fetchPermissions();

  if (!result.role) {
    redirect("/auth/login");
  }

  if (result.isSuperAdmin) return result;

  if (!canAccess(result.permissions, module, action)) {
    redirect("/unauthorized");
  }

  return result;
}

export async function assertPermission(
  module: PermissionModule,
  action: PermissionAction = "view",
): Promise<PermissionResult> {
  const result = await fetchPermissions();

  if (!result.role) {
    throw new PermissionError("auth", "authenticated");
  }

  if (result.isSuperAdmin) return result;

  if (!canAccess(result.permissions, module, action)) {
    throw new PermissionError(module, action);
  }

  return result;
}

export type ActionPermissions = {
  canView: boolean;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
};

export function getActionPermissions(
  permissions: RolePermissions,
  module: PermissionModule,
): ActionPermissions {
  return {
    canView: canAccess(permissions, module, "view"),
    canCreate: canAccess(permissions, module, "create"),
    canEdit: canAccess(permissions, module, "edit"),
    canDelete: canAccess(permissions, module, "delete"),
  };
}
