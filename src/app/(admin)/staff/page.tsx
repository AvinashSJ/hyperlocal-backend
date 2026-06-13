import { requirePermission, getActionPermissions } from "@/lib/require-permission";
import { getStoreScope } from "@/lib/store-scope";
import { getStaff, getStoresLight } from "./actions";
import StaffClient from "./StaffClient";

export default async function StaffPage() {
  const perm = await requirePermission("staff", "view");
  const scope = await getStoreScope();

  const staff = await getStaff(scope.storeId);
  const stores = perm.isSuperAdmin ? await getStoresLight() : [];
  const actionPerms = getActionPermissions(perm.permissions, "staff");

  return (
    <StaffClient
      staff={staff}
      stores={stores}
      storeId={scope.storeId}
      actionPerms={actionPerms}
    />
  );
}
