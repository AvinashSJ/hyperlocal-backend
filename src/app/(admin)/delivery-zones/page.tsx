import { requirePermission, getActionPermissions } from "@/lib/require-permission";
import { getDeliveryZones } from "./actions";
import type { StoreOption } from "./ZoneForm";
import { getStoreScope } from "@/lib/store-scope";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStores } from "@/app/(admin)/stores/actions";
import ZonesClient from "./ZonesClient";

export default async function DeliveryZonesPage() {
  const { permissions } = await requirePermission("delivery_zones", "view");
  const { storeId } = await getStoreScope();
  const zones = await getDeliveryZones(storeId);
  const actionPerms = getActionPermissions(permissions, "delivery_zones");

  let stores: StoreOption[] = [];
  if (!storeId) {
    const allStores = await getStores();
    stores = allStores.map((s) => ({
      id: s.id,
      name: s.name,
      delivery_radius_km: s.delivery_radius_km,
    }));
  } else {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("stores")
      .select("id, name, delivery_radius_km")
      .eq("id", storeId)
      .single();
    if (!error && data) {
      stores = [{ id: data.id, name: data.name, delivery_radius_km: data.delivery_radius_km }];
    }
  }

  return (
    <div>
      <h4 className="fw-bold mb-4">Delivery Zones</h4>
      <div className="card">
        <div className="card-body">
          <ZonesClient zones={zones} actionPerms={actionPerms} storeId={storeId} stores={stores} />
        </div>
      </div>
    </div>
  );
}