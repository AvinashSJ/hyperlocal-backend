import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import MasterLayout from "@/components/MasterLayout";
import { signOut } from "@/app/auth/actions";
import type { RolePermissions } from "@/lib/permissions";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  let fullName = user.email ?? "Admin";
  let role = "admin";
  let permissions: RolePermissions = {};
  let storeId: string | null = null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, role, role_id, store_id")
    .eq("id", user.id)
    .single();

  if (profile) {
    fullName = profile.full_name || user.email!;
    role = profile.role ?? "admin";
    storeId = profile.store_id;

    if (profile.role_id) {
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
  }

  const isSuperAdmin = role === "Super Admin";
  const isStoreScoped = !!(storeId && !isSuperAdmin);

  return (
    <MasterLayout
      user={{ email: user.email!, full_name: fullName, role }}
      permissions={permissions}
      storeId={storeId}
      isStoreScoped={isStoreScoped}
      isSuperAdmin={isSuperAdmin}
      onSignOut={signOut}
    >
      {children}
    </MasterLayout>
  );
}
