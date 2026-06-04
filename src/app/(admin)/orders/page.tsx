import { requirePermission, getActionPermissions } from "@/lib/require-permission";
import { getStoreScope } from "@/lib/store-scope";
import { getOrders } from "./actions";
import OrdersClient from "./OrdersClient";

export default async function OrdersPage() {
  const { permissions } = await requirePermission("orders", "view");
  const { storeId } = await getStoreScope();
  const orders = await getOrders(storeId);
  const actionPerms = getActionPermissions(permissions, "orders");

  return (
    <div>
      <h4 className="fw-bold mb-4">Orders</h4>
      <OrdersClient orders={orders} actionPerms={actionPerms} />
    </div>
  );
}
