import { requirePermission, getActionPermissions } from "@/lib/require-permission";
import { createClient } from "@/lib/supabase/server";
import { getUsers, getRoles, getStoresLight } from "./actions";
import UsersClient from "./UsersClient";

export default async function UsersPage() {
  const { permissions, role } = await requirePermission("users", "view");
  const users = await getUsers();
  const roles = await getRoles();
  const stores = await getStoresLight();
  const actionPerms = getActionPermissions(permissions, "users");

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const currentUserId = user?.id ?? "";

  return (
    <div>
      <h4 className="fw-bold mb-4">Users</h4>
      <div className="card">
        <div className="card-body">
          <UsersClient
            users={users}
            roles={roles}
            stores={stores}
            currentRole={role ?? ""}
            currentUserId={currentUserId}
            actionPerms={actionPerms}
          />
        </div>
      </div>
    </div>
  );
}
