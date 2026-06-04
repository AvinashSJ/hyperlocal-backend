import { requirePermission, getActionPermissions } from "@/lib/require-permission";
import { getBanners } from "./actions";
import { getStoreScope } from "@/lib/store-scope";
import BannersClient from "./BannersClient";

export default async function BannersPage() {
  const { permissions } = await requirePermission("banners", "view");
  const { storeId } = await getStoreScope();
  const banners = await getBanners(storeId);
  const actionPerms = getActionPermissions(permissions, "banners");
  return (
    <div>
      <h4 className="fw-bold mb-4">Banners</h4>
      <div className="card">
        <div className="card-body">
          <BannersClient banners={banners} actionPerms={actionPerms} />
        </div>
      </div>
    </div>
  );
}
