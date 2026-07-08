import { redirect } from "next/navigation";
import { requirePermission, getActionPermissions } from "@/lib/require-permission";
import { canAccess } from "@/lib/permissions";
import { getStoreScope, UnassignedStoreError, assertStoreScope } from "@/lib/store-scope";
import { getOrders } from "./actions";
import OrdersClient from "./OrdersClient";

export default async function OrdersPage() {
  const { permissions } = await requirePermission("orders", "view");
  const scope = await getStoreScope();
  // P47: redirect to the unassigned-store page if a non-Super-Admin
  // user has no store_id (e.g. P40b nulled it and the manager
  // hasn't been re-linked yet). Without this guard, the action
  // would skip the filter and return all orders across all stores
  // (the silent data leak).
  try {
    assertStoreScope(scope);
  } catch (err) {
    if (err instanceof UnassignedStoreError) {
      redirect("/unassigned-store");
    }
    throw err;
  }
  const orders = await getOrders(scope.storeId);
  const actionPerms = getActionPermissions(permissions, "orders");
  const canCreateInvoice = canAccess(permissions, "invoices", "create");

  return (
    <div>
      <h4 className="fw-bold mb-4">Orders</h4>
      <OrdersClient orders={orders} actionPerms={{ ...actionPerms, canCreateInvoice }} />
    </div>
  );
}
