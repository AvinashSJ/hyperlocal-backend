import { requirePermission, getActionPermissions } from "@/lib/require-permission";
import { getCommissions, getCommissionPayments } from "../actions";
import CommissionDetailClient from "./CommissionDetailClient";

export default async function CommissionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const perm = await requirePermission("commissions", "view");
  const { id } = await params;
  const actionPerms = getActionPermissions(perm.permissions, "commissions");

  const commissions = await getCommissions();
  const commission = commissions.find((c) => c.id === id);
  const payments = commission ? await getCommissionPayments(id) : [];

  if (!commission) {
    return (
      <div className="text-center py-5">
        <p className="text-muted">Commission not found</p>
      </div>
    );
  }

  return (
    <CommissionDetailClient
      commission={commission}
      payments={payments}
      actionPerms={actionPerms}
    />
  );
}
