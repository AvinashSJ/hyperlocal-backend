import { requirePermission, getActionPermissions } from "@/lib/require-permission";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStoreSettings } from "./actions";
import {
  getEligibleManagers,
  getLockedStoreCategories,
} from "@/app/(admin)/stores/actions";
import SettingsClient from "./SettingsClient";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ store_id?: string; new?: string }>;
}) {
  const { store_id: storeId, new: createParam } = await searchParams;
  const createMode = createParam === "true";

  const { permissions } = await requirePermission("stores", "view");
  const actionPerms = getActionPermissions(permissions, "stores");

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  let roleName = "Admin";
  const { data: profile } = await supabase
    .from("profiles")
    .select("role, role_id")
    .eq("id", user.id)
    .single();

  if (profile) {
    roleName = profile.role ?? "admin";
    if (profile.role_id) {
      const adminSupabase = createAdminClient();
      const { data: roleData } = await adminSupabase
        .from("roles")
        .select("name")
        .eq("id", profile.role_id)
        .single();
      if (roleData) roleName = roleData.name;
    }
  }

  const data = createMode ? null : await getStoreSettings(storeId);

  const adminSupabase = createAdminClient();
  const { data: allCategories } = await adminSupabase
    .from("categories")
    .select("id, name, parent_id, sort_order")
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .order("name");

  let assignedCategoryIds: string[] = [];
  let lockedCategoryIds: string[] = [];
  if (!createMode && data?.store?.id) {
    const [assignedRes, lockedRes] = await Promise.all([
      adminSupabase
        .from("store_categories")
        .select("category_id")
        .eq("store_id", data.store.id),
      getLockedStoreCategories(data.store.id),
    ]);
    assignedCategoryIds = (assignedRes.data ?? []).map((r) => r.category_id);
    const assignedSet = new Set(assignedCategoryIds);
    lockedCategoryIds = lockedRes
      .filter((l) => assignedSet.has(l.categoryId))
      .map((l) => l.categoryId);
  }

  const managers = createMode ? await getEligibleManagers() : [];

  return (
    <div>
      <h4 className="fw-bold mb-4">Store Settings</h4>
      <SettingsClient
        data={data}
        roleName={roleName}
        createMode={createMode}
        categories={allCategories ?? []}
        assignedCategoryIds={assignedCategoryIds}
        lockedCategoryIds={lockedCategoryIds}
        managers={managers}
        actionPerms={actionPerms}
      />
    </div>
  );
}
