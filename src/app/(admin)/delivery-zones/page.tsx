import { requirePermission, getActionPermissions } from "@/lib/require-permission";
import { getDeliveryZones } from "./actions";
import { getStoreScope } from "@/lib/store-scope";
import ZonesClient from "./ZonesClient";

export default async function DeliveryZonesPage() {
  const { permissions } = await requirePermission("delivery_zones", "view");
  const { storeId } = await getStoreScope();
  const zones = await getDeliveryZones(storeId);
  const actionPerms = getActionPermissions(permissions, "delivery_zones");
  return (
    <div>
      <h4 className="fw-bold mb-4">Delivery Zones</h4>
      <div className="card">
        <div className="card-body">
          <ZonesClient zones={zones} actionPerms={actionPerms} />
        </div>
      </div>
    </div>
  );
}
