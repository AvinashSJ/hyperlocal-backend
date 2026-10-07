import { requirePermission, getActionPermissions } from "@/lib/require-permission";
import { getEntityActivityLog } from "@/lib/activity-log";
import { getOrder } from "../actions";
import { getReturnsConfig } from "@/app/(admin)/settings/actions";
import OrderDetailClient from "./OrderDetailClient";

export default async function OrderDetailPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const { permissions, role } = await requirePermission("orders", "view");
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
  // Staff may update order status but must NOT edit payment status.
  const canUpdatePayment = role !== "Staff";
  const [order, activityLog] = await Promise.all([
    getOrder(id),
    getEntityActivityLog("order", id),
  ]);
  const returnsConfig = await getReturnsConfig();
  return (
    <div>
      <OrderDetailClient
        order={order}
        canCreateInvoice={invoicesActionPerms.canCreate}
        canUpdatePayment={canUpdatePayment}
        returnsActionPerms={returnsActionPerms}
        returnsEnabled={returnsConfig.enabled}
        activityLog={activityLog}
      />
    </div>
  );
}
