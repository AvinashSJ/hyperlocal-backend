import { requirePermission } from "@/lib/require-permission";
import { canAccess } from "@/lib/permissions";
import { getStoreScope } from "@/lib/store-scope";
import { listMedia } from "./actions";
import MediaClient from "./MediaClient";

export const dynamic = "force-dynamic";

export default async function MediaPage() {
  const { permissions } = await requirePermission("media", "view");
  const files = await listMedia();
  const canUpload = canAccess(permissions, "media", "upload");
  const canDelete = canAccess(permissions, "media", "delete");

  return <MediaClient initialFiles={files} canUpload={canUpload} canDelete={canDelete} />;
}
