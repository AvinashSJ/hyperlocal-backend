import { Icon } from "@iconify/react";
import Link from "next/link";
import { getStoreScope } from "@/lib/store-scope";

/**
 * P47: shown when a non-Super-Admin user has `profile.store_id = NULL`
 * (e.g. P40b nulled it and the manager hasn't been re-linked yet).
 * The /orders, /customers, /invoices pages all redirect here in that
 * case so the user sees a clear message instead of an empty list
 * (or, worse, all data across all stores — the silent data leak).
 */
export default async function UnassignedStorePage() {
  // Fetch the scope for the breadcrumb / display only. The page is
  // public to any logged-in user; no further permission check needed.
  const scope = await getStoreScope();

  return (
    <div className="d-flex justify-content-center pt-5">
      <div className="card shadow-sm" style={{ maxWidth: 560 }}>
        <div className="card-body p-4 text-center">
          <Icon
            icon="ri:store-3-line"
            className="text-warning"
            style={{ fontSize: 56 }}
          />
          <h4 className="fw-bold mt-3">Your account is not assigned to a store</h4>
          <p className="text-muted mb-4">
            Hi {scope.roleName ?? "there"}, your admin account is currently not
            linked to a specific store. Until a Super Admin assigns your
            account to a store, you cannot view orders, customers, or
            invoices.
          </p>
          <div className="alert alert-info text-start small mb-4">
            <strong>What to do:</strong>
            <ol className="mb-0 ps-3">
              <li>Contact a Super Admin.</li>
              <li>Ask them to open <code>Users</code> → find your account → set the <em>Store</em> field.</li>
              <li>Once linked, refresh this page to continue.</li>
            </ol>
          </div>
          <div className="d-flex gap-2 justify-content-center">
            <Link href="/dashboard" className="btn btn-outline-secondary">
              <Icon icon="ri:arrow-left-line" className="me-1" />
              Back to dashboard
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
