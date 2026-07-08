import { requirePermission, getActionPermissions } from "@/lib/require-permission";
import Link from "next/link";
import { getCommissionPeriodsForStore } from "../../actions";
import StoreCommissionsClient from "./StoreCommissionsClient";

export default async function StoreCommissionsPage({
  params,
}: {
  params: Promise<{ store_id: string }>;
}) {
  const perm = await requirePermission("commissions", "view");
  const { store_id: storeId } = await params;
  const actionPerms = getActionPermissions(perm.permissions, "commissions");

  // P68: per-store commission periods with live values. Auto-creates
  // a current-month row on first view if none exists.
  const { store, periods } = await getCommissionPeriodsForStore(storeId);

  return (
    <div>
      <div className="d-flex flex-wrap align-items-center gap-2 mb-4">
        <Link href="/commissions" className="btn btn-sm btn-outline-secondary">
          <span aria-hidden="true">←</span> Commissions
        </Link>
        <h5 className="mb-0">
          {store.name} <code className="text-muted small">{store.code}</code>
        </h5>
        <span className="badge bg-info bg-opacity-10 text-info ms-2">
          Rate: {store.commission_rate ?? 0}%
        </span>
      </div>

      <StoreCommissionsClient
        store={store}
        periods={periods}
        actionPerms={actionPerms}
      />
    </div>
  );
}
