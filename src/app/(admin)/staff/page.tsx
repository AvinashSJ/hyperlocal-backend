import { redirect } from "next/navigation";
import { requirePermission, getActionPermissions } from "@/lib/require-permission";
import { getStoreScope } from "@/lib/store-scope";
import { getStaff, getStoresLight } from "./actions";
import StaffClient from "./StaffClient";

export default async function StaffPage() {
  const perm = await requirePermission("staff", "view");

  // P28: Super Admins can create staff via /users (which calls
  // supabase.auth.admin.createUser and supports any role). The /staff
  // page is for store managers who manage their store's staff. Redirect
  // Super Admins away so they don't see a cross-store staff list.
  if (perm.isSuperAdmin) {
    redirect("/dashboard");
  }

  const scope = await getStoreScope();

  const staff = await getStaff(scope.storeId);
  const stores = await getStoresLight();
  const actionPerms = getActionPermissions(perm.permissions, "staff");

  return (
    <StaffClient
      staff={staff}
      stores={stores}
      storeId={scope.storeId}
      actionPerms={actionPerms}
    />
  );
}
