import { requirePermission, getActionPermissions } from "@/lib/require-permission";
import { getGstNumbers } from "./actions";
import { getStoreScope } from "@/lib/store-scope";
import GstClient from "./GstClient";

export default async function GstNumbersPage() {
  const { permissions } = await requirePermission("gst_numbers", "view");
  const { storeId } = await getStoreScope();
  const gstNumbers = await getGstNumbers(storeId);
  const actionPerms = getActionPermissions(permissions, "gst_numbers");
  return (
    <div>
      <h4 className="fw-bold mb-4">GST Numbers</h4>
      <div className="card">
        <div className="card-body">
          <GstClient gstNumbers={gstNumbers} actionPerms={actionPerms} />
        </div>
      </div>
    </div>
  );
}
