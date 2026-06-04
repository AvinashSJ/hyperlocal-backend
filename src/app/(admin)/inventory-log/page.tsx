import { requirePermission } from "@/lib/require-permission";
import { getInventoryLogs } from "./actions";
import { getStoreScope } from "@/lib/store-scope";
import InventoryClient from "./InventoryClient";

export default async function InventoryLogPage() {
  await requirePermission("inventory_log", "view");
  const { storeId } = await getStoreScope();
  const logs = await getInventoryLogs(storeId);
  return (
    <div>
      <h4 className="fw-bold mb-4">Inventory Log</h4>
      <div className="card">
        <div className="card-body">
          <InventoryClient logs={logs} />
        </div>
      </div>
    </div>
  );
}
