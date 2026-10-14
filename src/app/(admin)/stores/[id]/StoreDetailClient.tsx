"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "react-toastify";
import { Icon } from "@iconify/react";
import type { StoreRow } from "../actions";
import type { StoreRelations, StoreManagerRow } from "../actions";
import {
  addStoreManager,
  removeStoreManager,
  setStorePrimaryManager,
} from "../actions";
import { runServerAction } from "@/lib/run-server-action";
// P63: client-side date renderer. Avoids hydration mismatches caused
// by server/client timezone divergence in toLocaleString.
import ClientDate from "@/components/ClientDate";

type ActionPermissions = {
  canView: boolean; canCreate: boolean; canEdit: boolean; canDelete: boolean;
};

type AssignableManager = {
  id: string;
  full_name: string | null;
  email: string | null;
};

export default function StoreDetailClient({
  store,
  relations,
  actionPerms,
  primaryGstin,
  managers = [],
  eligibleManagers = [],
}: {
  store: StoreRow;
  relations: StoreRelations;
  actionPerms?: ActionPermissions;
  primaryGstin?: {
    gstin: string;
    legal_name: string;
    state_code: string | null;
  } | null;
  managers?: StoreManagerRow[];
  eligibleManagers?: AssignableManager[];
}) {
  const fmtMoney = (n: number) => `₹${n.toLocaleString("en-IN")}`;
  const router = useRouter();
  const [managerBusy, setManagerBusy] = useState(false);
  const [managerError, setManagerError] = useState<string | null>(null);
  const [managerToAdd, setManagerToAdd] = useState("");
  const [managerForPrimary, setManagerForPrimary] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(
    new Set(["orders", "customers", "invoices", "products"]),
  );

  const hasPrimary = managers.some((m) => m.isPrimary);

  async function runManagerAction(
    action: () => Promise<unknown>,
    successMessage: string,
  ) {
    setManagerError(null);
    setManagerBusy(true);
    const result = await runServerAction(action);
    setManagerBusy(false);
    if (result.ok) {
      toast.success(successMessage);
      setManagerToAdd("");
      setManagerForPrimary("");
      router.refresh();
    } else {
      setManagerError(result.error.message);
      toast.error(result.error.message);
    }
  }
  const toggleSection = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div data-testid="store-detail-root">
      {/* Header card: logo + name + status badges + actions */}
      <div className="card mb-3">
        <div className="card-body d-flex flex-wrap gap-3 align-items-center">
          {store.logo_url ? (
            <img
              src={store.logo_url}
              alt="Logo"
              className="border rounded"
              style={{ width: 72, height: 72, objectFit: "cover" }}
              data-testid="store-logo"
            />
          ) : (
            <div
              className="border rounded bg-light d-flex align-items-center justify-content-center text-muted"
              style={{ width: 72, height: 72 }}
            >
              <Icon icon="ri:store-2-line" style={{ fontSize: 32 }} />
            </div>
          )}
          <div className="flex-grow-1">
            <h4 className="mb-1" data-testid="store-name">{store.name}</h4>
            <div className="text-muted small">
              <code>{store.slug}</code>
              {store.code && (
                <>
                  {" · "}
                  <span className="badge bg-secondary bg-opacity-10 text-secondary" data-testid="store-code">
                    {store.code}
                  </span>
                </>
              )}
            </div>
            <div className="mt-2 d-flex flex-wrap gap-2">
              <span className={`badge ${store.is_active ? "bg-success" : "bg-secondary"}`}>
                {store.is_active ? "Active" : "Inactive"}
              </span>
              <span className={`badge ${store.is_open ? "bg-info" : "bg-secondary"}`}>
                {store.is_open ? "Open" : "Closed"}
              </span>
              {store.phone && (
                <span className="badge bg-light text-dark border">
                  <Icon icon="ri:phone-line" className="me-1" />
                  {store.phone}
                </span>
              )}
            </div>
          </div>
          <div className="d-flex gap-2">
            {actionPerms?.canEdit && (
              <Link
                href={`/settings?store_id=${store.id}`}
                className="btn btn-outline-primary btn-sm"
                data-testid="edit-store-btn"
              >
                <Icon icon="ri:pencil-line" className="me-1" />
                Edit Store
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* Managers card: the primary manager (permanent) plus additional
          managers that can be attached/detached. A manager belongs to a
          single store, so only unassigned managers are offered to add.
          The one-time "designate primary" control appears only for legacy
          stores created before the primary rule existed (owner_id NULL). */}
      {actionPerms?.canEdit && (
        <div className="card mb-3" data-testid="store-detail-managers-card">
          <div className="card-header">
            <strong>
              <Icon icon="ri:user-star-line" className="me-1" />
              Managers
            </strong>
          </div>
          <div className="card-body">
            {managerError && (
              <div className="alert alert-danger py-2" role="alert">
                {managerError}
              </div>
            )}

            {managers.length === 0 ? (
              <div className="text-muted small mb-3" data-testid="store-managers-empty">
                No managers assigned yet.
              </div>
            ) : (
              <ul className="list-group list-group-flush mb-3">
                {managers.map((m) => (
                  <li
                    key={m.id}
                    className="list-group-item d-flex justify-content-between align-items-center px-0"
                    data-testid={`store-manager-${m.id}`}
                  >
                    <span>
                      {m.full_name ?? m.email ?? m.id}
                      {m.isPrimary && (
                        <span
                          className="badge bg-primary ms-2"
                          data-testid={`store-manager-primary-${m.id}`}
                        >
                          Primary
                        </span>
                      )}
                    </span>
                    {!m.isPrimary && (
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-danger"
                        disabled={managerBusy}
                        data-testid={`store-manager-remove-${m.id}`}
                        onClick={() =>
                          runManagerAction(
                            () => removeStoreManager(store.id, m.id),
                            "Manager removed",
                          )
                        }
                      >
                        Remove
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}

            {!hasPrimary && managers.length > 0 && (
              <div className="border rounded p-2 mb-3 bg-light">
                <div className="small text-muted mb-2">
                  This store has no primary manager yet. Designate one — this
                  cannot be changed later.
                </div>
                <div className="d-flex gap-2">
                  <select
                    className="form-select"
                    value={managerForPrimary}
                    onChange={(e) => setManagerForPrimary(e.target.value)}
                    data-testid="store-manager-set-primary-select"
                  >
                    <option value="">-- Select a manager --</option>
                    {managers.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.full_name ? `${m.full_name} (${m.email ?? ""})` : m.email ?? m.id}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="btn btn-primary text-nowrap"
                    disabled={!managerForPrimary || managerBusy}
                    data-testid="store-manager-set-primary-btn"
                    onClick={() =>
                      runManagerAction(
                        () => setStorePrimaryManager(store.id, managerForPrimary),
                        "Primary manager set",
                      )
                    }
                  >
                    Set as primary
                  </button>
                </div>
              </div>
            )}

            {eligibleManagers.length > 0 ? (
              <div className="d-flex gap-2">
                <select
                  className="form-select"
                  value={managerToAdd}
                  onChange={(e) => setManagerToAdd(e.target.value)}
                  data-testid="store-manager-add-select"
                >
                  <option value="">-- Add a manager --</option>
                  {eligibleManagers.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.full_name ? `${m.full_name} (${m.email ?? ""})` : m.email ?? m.id}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="btn btn-primary text-nowrap"
                  disabled={!managerToAdd || managerBusy}
                  data-testid="store-manager-add-btn"
                  onClick={() =>
                    runManagerAction(
                      () => addStoreManager(store.id, managerToAdd),
                      "Manager added",
                    )
                  }
                >
                  Add
                </button>
              </div>
            ) : (
              <div className="text-muted small" data-testid="store-managers-no-eligible">
                No unassigned managers available.
              </div>
            )}
          </div>
        </div>
      )}

      {/* P65: GST Information card. Shows the primary GSTIN used for
          invoicing, with quick access to the full /gst-numbers
          management page. Null = not loaded, undefined = no primary
          configured for this store. */}
      <div className="card mb-3" data-testid="store-detail-gst-card">
        <div className="card-header d-flex justify-content-between align-items-center">
          <strong>
            <Icon icon="ri:file-shield-2-line" className="me-1" />
            GST Information
          </strong>
          <Link
            href={`/gst-numbers?store_id=${store.id}`}
            className="btn btn-sm btn-outline-primary"
            data-testid="store-detail-gst-manage-link"
          >
            <Icon icon="ri:external-link-line" className="me-1" />
            Manage GST Numbers
          </Link>
        </div>
        <div className="card-body">
          {primaryGstin ? (
            <div className="row g-2">
              <div className="col-md-6">
                <div className="text-muted small">Primary GSTIN</div>
                <code data-testid="store-detail-primary-gstin">{primaryGstin.gstin}</code>
              </div>
              <div className="col-md-4">
                <div className="text-muted small">Legal Name</div>
                <div>{primaryGstin.legal_name || <span className="text-muted">—</span>}</div>
              </div>
              <div className="col-md-2">
                <div className="text-muted small">State Code</div>
                <div>{primaryGstin.state_code || <span className="text-muted">—</span>}</div>
              </div>
            </div>
          ) : (
            <div className="text-muted small" data-testid="store-detail-no-gstin">
              No primary GSTIN configured for this store.{" "}
              <Link href={`/settings?store_id=${store.id}`}>
                Add one in Store Settings
              </Link>
              .
            </div>
          )}
        </div>
      </div>

      {/* 4 summary stat cards */}
      <div className="row g-2 mb-3" data-testid="store-detail-stats">
        <div className="col-6 col-md-3">
          <div className="card border-0 bg-light h-100">
            <div className="card-body text-center p-2">
              <Icon icon="ri:shopping-cart-2-line" className="text-muted" style={{ fontSize: 20 }} />
              <div className="fw-bold fs-4 mt-1" data-testid="stat-orders">
                {relations.orderCount.toLocaleString()}
              </div>
              <div className="text-muted small">Orders</div>
            </div>
          </div>
        </div>
        <div className="col-6 col-md-3">
          <div className="card border-0 bg-light h-100">
            <div className="card-body text-center p-2">
              <Icon icon="ri:user-line" className="text-muted" style={{ fontSize: 20 }} />
              <div className="fw-bold fs-4 mt-1" data-testid="stat-customers">
                {relations.customerCount.toLocaleString()}
              </div>
              <div className="text-muted small">Customers</div>
            </div>
          </div>
        </div>
        <div className="col-6 col-md-3">
          <div className="card border-0 bg-light h-100">
            <div className="card-body text-center p-2">
              <Icon icon="ri:file-text-line" className="text-muted" style={{ fontSize: 20 }} />
              <div className="fw-bold fs-4 mt-1" data-testid="stat-invoices">
                {relations.invoiceCount.toLocaleString()}
              </div>
              <div className="text-muted small">Invoices</div>
            </div>
          </div>
        </div>
        <div className="col-6 col-md-3">
          <div className="card border-0 bg-light h-100">
            <div className="card-body text-center p-2">
              <Icon icon="ri:box-3-line" className="text-muted" style={{ fontSize: 20 }} />
              <div className="fw-bold fs-4 mt-1" data-testid="stat-products">
                {relations.productCount.toLocaleString()}
              </div>
              <div className="text-muted small">Products</div>
            </div>
          </div>
        </div>
      </div>

      {/* 4 collapsible sections: orders, customers, invoices, products */}
      <div>
        {/* Recent orders */}
        <div className="mb-3" data-testid="store-detail-orders-section">
          <div className="card">
            <button
              type="button"
              className="card-header d-flex align-items-center justify-content-between w-100 border-0 bg-transparent text-start"
              onClick={() => toggleSection("orders")}
              style={{ cursor: "pointer" }}
            >
              <strong>
                <Icon icon="ri:shopping-cart-2-line" className="me-1" />
                Recent Orders
              </strong>
              <div className="d-flex align-items-center gap-2">
                {relations.orderCount > relations.orders.length && (
                  <span className="text-muted small">
                    showing {relations.orders.length} of {relations.orderCount}
                  </span>
                )}
                <Icon
                  icon="ri:arrow-down-s-line"
                  width={20}
                  style={{
                    transform: expanded.has("orders") ? "rotate(180deg)" : "",
                    transition: "transform 0.2s",
                  }}
                />
              </div>
            </button>
            {expanded.has("orders") && (
            <div className="table-responsive" style={{ maxHeight: 320 }}>
              {relations.orders.length === 0 ? (
                <div className="text-muted small text-center py-3">No orders</div>
              ) : (
                <table className="table table-sm table-hover mb-0 align-middle">
                  <thead className="table-light position-sticky top-0">
                    <tr>
                      <th>Order #</th>
                      <th>Customer</th>
                      <th className="text-end">Amount</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {relations.orders.map((o) => (
                      <tr key={o.id} data-testid={`detail-order-row-${o.id}`}>
                        <td>
                          <Link href={`/orders/${o.id}`} className="text-decoration-none">
                            {o.order_number}
                          </Link>
                        </td>
                        <td>{o.customer_name ?? "—"}</td>
                        <td className="text-end">{fmtMoney(o.total_amount)}</td>
                        <td>
                          <span className="badge bg-secondary bg-opacity-10 text-secondary text-capitalize">
                            {o.status.replace("_", " ")}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            )}
          </div>
        </div>

        {/* Top customers */}
        <div className="mb-3" data-testid="store-detail-customers-section">
          <div className="card">
            <button
              type="button"
              className="card-header d-flex align-items-center justify-content-between w-100 border-0 bg-transparent text-start"
              onClick={() => toggleSection("customers")}
              style={{ cursor: "pointer" }}
            >
              <strong>
                <Icon icon="ri:user-line" className="me-1" />
                Top Customers
              </strong>
              <div className="d-flex align-items-center gap-2">
                {relations.customerCount > relations.customers.length && (
                  <span className="text-muted small">
                    showing {relations.customers.length} of {relations.customerCount}
                  </span>
                )}
                <Icon
                  icon="ri:arrow-down-s-line"
                  width={20}
                  style={{
                    transform: expanded.has("customers") ? "rotate(180deg)" : "",
                    transition: "transform 0.2s",
                  }}
                />
              </div>
            </button>
            {expanded.has("customers") && (
            <div className="table-responsive" style={{ maxHeight: 320 }}>
              {relations.customers.length === 0 ? (
                <div className="text-muted small text-center py-3">No customers</div>
              ) : (
                <table className="table table-sm table-hover mb-0 align-middle">
                  <thead className="table-light position-sticky top-0">
                    <tr>
                      <th>Name</th>
                      <th>Phone</th>
                      <th className="text-center">Orders</th>
                    </tr>
                  </thead>
                  <tbody>
                    {relations.customers.map((c) => (
                      <tr key={c.id} data-testid={`detail-customer-row-${c.id}`}>
                        <td>{c.full_name ?? "—"}</td>
                        <td className="text-muted small">{c.phone ?? "—"}</td>
                        <td className="text-center">
                          <span className="badge bg-primary bg-opacity-10 text-primary">
                            {c.order_count}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            )}
          </div>
        </div>

        {/* Recent invoices */}
        <div className="mb-3" data-testid="store-detail-invoices-section">
          <div className="card">
            <button
              type="button"
              className="card-header d-flex align-items-center justify-content-between w-100 border-0 bg-transparent text-start"
              onClick={() => toggleSection("invoices")}
              style={{ cursor: "pointer" }}
            >
              <strong>
                <Icon icon="ri:file-text-line" className="me-1" />
                Recent Invoices
              </strong>
              <div className="d-flex align-items-center gap-2">
                {relations.invoiceCount > relations.invoices.length && (
                  <span className="text-muted small">
                    showing {relations.invoices.length} of {relations.invoiceCount}
                  </span>
                )}
                <Icon
                  icon="ri:arrow-down-s-line"
                  width={20}
                  style={{
                    transform: expanded.has("invoices") ? "rotate(180deg)" : "",
                    transition: "transform 0.2s",
                  }}
                />
              </div>
            </button>
            {expanded.has("invoices") && (
            <div className="table-responsive" style={{ maxHeight: 320 }}>
              {relations.invoices.length === 0 ? (
                <div className="text-muted small text-center py-3">No invoices</div>
              ) : (
                <table className="table table-sm table-hover mb-0 align-middle">
                  <thead className="table-light position-sticky top-0">
                    <tr>
                      <th>Invoice #</th>
                      <th>Order #</th>
                      <th className="text-end">Amount</th>
                      <th>Status</th>
                      <th>Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {relations.invoices.map((i) => (
                      <tr key={i.id} data-testid={`detail-invoice-row-${i.id}`}>
                        <td>
                          <Link href={`/invoices/${i.id}`} className="text-decoration-none">
                            {i.invoice_number}
                          </Link>
                        </td>
                        <td>{i.order_number ?? "—"}</td>
                        <td className="text-end">{fmtMoney(i.total_amount)}</td>
                        <td>
                          <span className="badge bg-secondary bg-opacity-10 text-secondary text-capitalize">
                            {i.status.replace("_", " ")}
                          </span>
                        </td>
                        <td className="text-muted small">
                          <ClientDate
                            value={i.created_at}
                            format="datetime"
                            options={{ year: "numeric", month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" }}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            )}
          </div>
        </div>

        {/* Products */}
        <div className="mb-3" data-testid="store-detail-products-section">
          <div className="card">
            <button
              type="button"
              className="card-header d-flex align-items-center justify-content-between w-100 border-0 bg-transparent text-start"
              onClick={() => toggleSection("products")}
              style={{ cursor: "pointer" }}
            >
              <strong>
                <Icon icon="ri:box-3-line" className="me-1" />
                Products
              </strong>
              <div className="d-flex align-items-center gap-2">
                {relations.productCount > relations.products.length && (
                  <span className="text-muted small">
                    showing {relations.products.length} of {relations.productCount}
                  </span>
                )}
                <Icon
                  icon="ri:arrow-down-s-line"
                  width={20}
                  style={{
                    transform: expanded.has("products") ? "rotate(180deg)" : "",
                    transition: "transform 0.2s",
                  }}
                />
              </div>
            </button>
            {expanded.has("products") && (
            <div className="table-responsive" style={{ maxHeight: 320 }}>
              {relations.products.length === 0 ? (
                <div className="text-muted small text-center py-3">No products</div>
              ) : (
                <table className="table table-sm table-hover mb-0 align-middle">
                  <thead className="table-light position-sticky top-0">
                    <tr>
                      <th>Name</th>
                      <th>SKU</th>
                      <th className="text-end">MRP</th>
                      <th className="text-end">Stock</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {relations.products.map((p) => (
                      <tr key={p.id} data-testid={`detail-product-row-${p.id}`}>
                        <td>
                          <Link href={`/products/${p.id}`} className="text-decoration-none">
                            {p.name}
                          </Link>
                        </td>
                        <td className="text-muted small"><code>{p.sku ?? "—"}</code></td>
                        <td className="text-end">{fmtMoney(p.mrp)}</td>
                        <td className="text-end">{p.stock_quantity}</td>
                        <td>
                          <span
                            className={`badge ${
                              p.status === "active"
                                ? "bg-success-subtle text-success"
                                : "bg-secondary-subtle text-secondary"
                            } text-capitalize`}
                          >
                            {p.status.replace("_", " ")}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
