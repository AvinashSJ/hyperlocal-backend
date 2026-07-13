import { requirePermission, getActionPermissions } from "@/lib/require-permission";
import { getEntityActivityLog } from "@/lib/activity-log";
import { getOrder } from "../actions";
import OrderDetailClient from "./OrderDetailClient";

export default async function OrderDetailPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const { permissions } = await requirePermission("orders", "view");
  // P57: pass invoiceActionPerms to the client so the [Generate Invoice]
  // retry button is only shown to callers with `invoices:create`.
  // The button is hidden for Staff (who has invoices:view only) —
  // clicking it would just error in the server action.
  // P62: pass returnsActionPerms separately — the return requests
  // panel shows its Manager actions (Acknowledge / Mark processing /
  // Approve / Reject / Mark fulfilled) gated by `returns:edit`
  // and the raise-button gated by `returns:create`.
  const invoicesActionPerms = getActionPermissions(permissions, "invoices");
  const returnsActionPerms = getActionPermissions(permissions, "returns");
  const [order, activityLog] = await Promise.all([
    getOrder(id),
    getEntityActivityLog("order", id),
  ]);
  return (
    <div>
      <OrderDetailClient
        order={order}
        canCreateInvoice={invoicesActionPerms.canCreate}
        returnsActionPerms={returnsActionPerms}
        activityLog={activityLog}
      />
    </div>
  );
}
