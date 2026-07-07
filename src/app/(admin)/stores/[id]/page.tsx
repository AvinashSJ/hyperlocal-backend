import { requirePermission, getActionPermissions } from "@/lib/require-permission";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Icon } from "@iconify/react";
import { createClient } from "@/lib/supabase/server";
import { getStoreById, getStoreRelations } from "../actions";
import { getPrimaryGstin } from "@/app/(admin)/gst-numbers/actions";
import StoreDetailClient from "./StoreDetailClient";

/**
 * P49: per-store drill-down page. Renders a single store's
 * attributes, summary stats, and four related-data sections
 * (orders, customers, invoices, products) for Super Admin.
 *
 * Manager/Staff do not get this page — they already see their
 * scoped data on /orders, /customers, /invoices, /products. We
 * redirect them to /dashboard to keep the URL space clean.
 *
 * Permission gate: stores:view (matches the list page).
 * The data layer is read-only.
 */
export default async function StoreDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { permissions } = await requirePermission("stores", "view");
  const actionPerms = getActionPermissions(permissions, "stores");
  const { id } = await params;

  // Resolve roleName the same way /stores does so we can decide
  // whether to show the per-store data. Manager/Staff are bounced.
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");
  const { data: profile } = await supabase
    .from("profiles")
    .select("role, role_id")
    .eq("id", user.id)
    .single();
  let roleName = "admin";
  if (profile) {
    roleName = profile.role ?? "admin";
    if (profile.role_id) {
      const { createAdminClient } = await import("@/lib/supabase/admin");
      const adminSupabase = createAdminClient();
      const { data: roleData } = await adminSupabase
        .from("roles")
        .select("name")
        .eq("id", profile.role_id)
        .single();
      if (roleData) roleName = roleData.name;
    }
  }

  if (roleName !== "Super Admin") redirect("/dashboard");

  const [store, relations, primaryGstin] = await Promise.all([
    getStoreById(id),
    getStoreRelations(id),
    getPrimaryGstin(id),
  ]);

  if (!store) {
    return (
      <div className="text-center py-5">
        <Icon icon="ri:store-2-line" style={{ fontSize: 48 }} className="text-muted mb-2" />
        <h5 className="text-muted">Store not found</h5>
        <Link href="/stores" className="btn btn-link">
          <Icon icon="ri:arrow-left-line" className="me-1" />
          Back to Stores
        </Link>
      </div>
    );
  }

  return (
    <div>
      <div className="d-flex flex-wrap gap-2 align-items-center mb-3">
        <Link href="/stores" className="btn btn-link p-0 text-decoration-none">
          <Icon icon="ri:arrow-left-line" className="me-1" />
          Stores
        </Link>
        <span className="text-muted">/</span>
        <h5 className="mb-0">{store.name}</h5>
      </div>
      <StoreDetailClient
        store={store}
        relations={relations}
        actionPerms={actionPerms}
        primaryGstin={primaryGstin}
      />
    </div>
  );
}
