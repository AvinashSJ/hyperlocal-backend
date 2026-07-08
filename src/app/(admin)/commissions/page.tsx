import { requirePermission, getActionPermissions } from "@/lib/require-permission";
import { getCommissionStoresForList } from "./actions";
import CommissionsClient from "./CommissionsClient";

export default async function CommissionsPage() {
  const perm = await requirePermission("commissions", "view");
  const actionPerms = getActionPermissions(perm.permissions, "commissions");

  // P68: the list page now shows STORES, not commissions. Each store
  // has a live aggregate of total commission, paid, and balance
  // across all its commission periods.
  const stores = await getCommissionStoresForList();

  return (
    <div>
      <h4 className="mb-3">Store Commissions</h4>
      <CommissionsClient stores={stores} actionPerms={actionPerms} />
    </div>
  );
}
