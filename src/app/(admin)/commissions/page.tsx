import { requirePermission, getActionPermissions } from "@/lib/require-permission";
import { getCommissionStoresForList } from "./actions";
import CommissionsClient from "./CommissionsClient";

export default async function CommissionsPage() {
  const perm = await requirePermission("commissions", "view");
  const actionPerms = getActionPermissions(perm.permissions, "commissions");

  // Weekly snapshot commissions: the list page shows STORES, not commissions.
  // Each store has totals summed from its LOCKED per-week commission rows
  // plus payments tracked per period.
  const stores = await getCommissionStoresForList();

  return (
    <div>
      <h4 className="mb-3">Store Commissions</h4>
      <CommissionsClient stores={stores} actionPerms={actionPerms} />
    </div>
  );
}
