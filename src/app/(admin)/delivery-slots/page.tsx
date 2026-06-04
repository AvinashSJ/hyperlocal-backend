import { requirePermission, getActionPermissions } from "@/lib/require-permission";
import { getDeliverySlots } from "./actions";
import { getStoreScope } from "@/lib/store-scope";
import SlotsClient from "./SlotsClient";

export default async function DeliverySlotsPage() {
  const { permissions } = await requirePermission("delivery_slots", "view");
  const { storeId } = await getStoreScope();
  const slots = await getDeliverySlots(storeId);
  const actionPerms = getActionPermissions(permissions, "delivery_slots");
  return (
    <div>
      <h4 className="fw-bold mb-4">Delivery Slots</h4>
      <div className="card">
        <div className="card-body">
          <SlotsClient slots={slots} actionPerms={actionPerms} />
        </div>
      </div>
    </div>
  );
}
