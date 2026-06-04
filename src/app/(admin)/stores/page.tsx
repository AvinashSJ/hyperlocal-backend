import { requirePermission, getActionPermissions } from "@/lib/require-permission";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStores } from "./actions";
import StoresClient from "./StoresClient";

export default async function StoresPage() {
  const { permissions } = await requirePermission("stores", "view");
  const actionPerms = getActionPermissions(permissions, "stores");
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, role_id")
    .eq("id", user.id)
    .single();

  let roleName = "admin";
  if (profile) {
    roleName = profile.role ?? "admin";
    if (profile.role_id) {
      const adminSupabase = createAdminClient();
      const { data: roleData } = await adminSupabase
        .from("roles")
        .select("name")
        .eq("id", profile.role_id)
        .single();
      if (roleData) roleName = roleData.name;
    }
  }

  if (roleName !== "Super Admin") redirect("/dashboard");

  const stores = await getStores();

  return (
    <div>
      <h4 className="fw-bold mb-4">Stores</h4>
      <div className="card">
        <div className="card-body">
          <StoresClient stores={stores} actionPerms={actionPerms} />
        </div>
      </div>
    </div>
  );
}
