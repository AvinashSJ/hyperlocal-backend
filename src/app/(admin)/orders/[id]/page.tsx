import { requirePermission, getActionPermissions } from "@/lib/require-permission";
import { getOrder } from "../actions";
import OrderDetailClient from "./OrderDetailClient";

export default async function OrderDetailPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const { permissions } = await requirePermission("orders", "view");
  // P57: pass actionPerms to the client so the [Generate Invoice]
  // retry button is only shown to callers with `invoices:create`.
  // The button is hidden for Staff (who has invoices:view only) —
  // clicking it would just error in the server action.
  // P62: also include the `returns` permission set so the return
  // requests panel can show its Manager actions (Acknowledge /
  // Mark processing / Approve / Reject / Mark fulfilled) only to
  // callers with `returns:edit`.
  const ordersActionPerms = getActionPermissions(permissions, "orders");
  const invoicesActionPerms = getActionPermissions(permissions, "invoices");
  const returnsActionPerms = getActionPermissions(permissions, "returns");
  const actionPerms = { ...ordersActionPerms, ...invoicesActionPerms, ...returnsActionPerms };
  const order = await getOrder(id);
  return (
    <div>
      <OrderDetailClient order={order} actionPerms={actionPerms} />
    </div>
  );
}
