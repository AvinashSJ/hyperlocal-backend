import { requirePermission, getActionPermissions } from "@/lib/require-permission";
import { getStoreScope } from "@/lib/store-scope";
import { getCommissions, getStoresLight } from "./actions";
import CommissionsClient from "./CommissionsClient";

export default async function CommissionsPage() {
  const perm = await requirePermission("commissions", "view");
  const scope = await getStoreScope();

  const commissions = await getCommissions(scope.storeId);
  const stores = perm.isSuperAdmin ? await getStoresLight() : [];
  const actionPerms = getActionPermissions(perm.permissions, "commissions");

  return (
    <div>
      <h4 className="mb-3">Store Commissions</h4>
      <CommissionsClient
        commissions={commissions}
        stores={stores}
        storeId={scope.storeId}
        actionPerms={actionPerms}
      />
    </div>
  );
}
