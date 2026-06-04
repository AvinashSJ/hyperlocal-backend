import { requirePermission, getActionPermissions } from "@/lib/require-permission";
import { getUsers, getRoles, getStoresLight } from "./actions";
import UsersClient from "./UsersClient";

export default async function UsersPage() {
  const { permissions, role } = await requirePermission("users", "view");
  const users = await getUsers();
  const roles = await getRoles();
  const stores = await getStoresLight();
  const actionPerms = getActionPermissions(permissions, "users");

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
            actionPerms={actionPerms}
          />
        </div>
      </div>
    </div>
  );
}
