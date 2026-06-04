import { requirePermission, getActionPermissions } from "@/lib/require-permission";
import { getRoles } from "./actions";
import RolesClient from "./RolesClient";

export const dynamic = "force-dynamic";

export default async function RolesPage() {
  const { permissions } = await requirePermission("roles", "view");
  const roles = await getRoles();
  const actionPerms = getActionPermissions(permissions, "roles");

  return (
    <div>
      <h4 className="fw-bold mb-4">Roles</h4>
      <RolesClient roles={roles} actionPerms={actionPerms} />
    </div>
  );
}
