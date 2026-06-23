"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import Link from "next/link";
import { Icon } from "@iconify/react";
import { toast } from "react-toastify";
import { runServerAction } from "@/lib/run-server-action";
import type { StoreRow, StoreRelations, StoreCustomerRow } from "./actions";
import {
  getStoreCategories,
  setStoreCategories,
  getLockedStoreCategories,
  getStoreRelations,
} from "./actions";
import type { LockedCategory } from "./actions";

type CategoryOption = {
  id: string;
  name: string;
  parent_id: string | null;
  sort_order: number;
};

function Modal({
  title,
  children,
  onClose,
  width,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  width?: number;
}) {
  return (
    <div
      style={{
        position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.5)", zIndex: 1050,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
      onClick={onClose}
    >
      <div className="card" style={{ width: width ?? 600, maxWidth: "90vw", maxHeight: "90vh", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
        <div className="card-header d-flex justify-content-between align-items-center">
          <strong>{title}</strong>
          <button type="button" className="btn-close" onClick={onClose} />
        </div>
        <div className="card-body">{children}</div>
      </div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="row mb-2">
      <div className="col-4 text-muted small">{label}</div>
      <div className="col-8">{value ?? "\u2014"}</div>
    </div>
  );
}

type ActionPermissions = {
  canView: boolean; canCreate: boolean; canEdit: boolean; canDelete: boolean;
};

export default function StoresClient({
  stores,
  categories,
  roleName,
  actionPerms,
}: {
  stores: StoreRow[];
  categories: CategoryOption[];
  roleName: string;
  actionPerms?: ActionPermissions;
}) {
  const isSuperAdmin = roleName === "Super Admin";
  const [search, setSearch] = useState("");
  // P49: viewing now includes the relations (orders, customers,
  // invoices, products) so the modal can show the per-store drill-down
  // (summary cards + 4 scrollable tables). Fetched lazily on click.
  const [viewing, setViewing] = useState<{ store: StoreRow; relations: StoreRelations | null; loadingRelations: boolean } | null>(null);
  const [assignedIds, setAssignedIds] = useState<string[]>([]);
  const [lockedCategories, setLockedCategories] = useState<LockedCategory[]>([]);
  const [loadingAssigned, setLoadingAssigned] = useState(false);
  const [editingCategories, setEditingCategories] = useState(false);
  const [pendingCategoryIds, setPendingCategoryIds] = useState<string[]>([]);
  const [savingCategories, setSavingCategories] = useState(false);

  const filtered = useMemo(() => {
    if (!search) return stores;
    const q = search.toLowerCase();
    return stores.filter((s) =>
      s.name.toLowerCase().includes(q) ||
      (s.slug?.toLowerCase() ?? "").includes(q) ||
      (s.phone ?? "").includes(q) ||
      (s.city?.toLowerCase() ?? "").includes(q) ||
      (s.email?.toLowerCase() ?? "").includes(q)
    );
  }, [stores, search]);

  const openView = useCallback((store: StoreRow) => {
    // Reset state for the new store, mark relations as loading.
    setViewing({ store, relations: null, loadingRelations: true });
    setEditingCategories(false);
    setPendingCategoryIds([]);
    setAssignedIds([]);
    setLockedCategories([]);
  }, []);

  useEffect(() => {
    if (!viewing) return;
    let cancelled = false;
    const storeId = viewing.store.id;
    Promise.resolve().then(() => {
      if (cancelled) return;
      setLoadingAssigned(true);
    });
    Promise.all([
      getStoreCategories(storeId),
      getLockedStoreCategories(storeId),
      // P49: lazy-load the per-store relations. Fire-and-forget; we
      // update the viewing state when it resolves. Errors are surfaced
      // via toast but the modal still opens (categories work fine).
      runServerAction(getStoreRelations, storeId).then((r) => {
        if (cancelled) return;
        if (r.ok) {
          setViewing((v) => v ? { ...v, relations: r.value, loadingRelations: false } : v);
        } else {
          setViewing((v) => v ? { ...v, relations: null, loadingRelations: false } : v);
          toast.error("Failed to load store relations");
        }
      }),
    ])
      .then(([assigned, locked]) => {
        if (cancelled) return;
        const assignedIdsLocal = assigned.map((c) => c.id);
        setAssignedIds(assignedIdsLocal);
        setPendingCategoryIds(assignedIdsLocal);
        const lockedIds = new Set(locked.map((l) => l.categoryId));
        setLockedCategories(
          locked.filter((l) => assignedIdsLocal.includes(l.categoryId)),
        );
        setPendingCategoryIds((prev) => {
          const next = new Set(prev);
          lockedIds.forEach((id) => next.add(id));
          return Array.from(next);
        });
      })
      .catch(() => {
        if (cancelled) return;
        toast.error("Failed to load store categories");
      })
      .finally(() => {
        if (!cancelled) setLoadingAssigned(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewing?.store.id]);

  const lockedIdSet = useMemo(
    () => new Set(lockedCategories.map((l) => l.categoryId)),
    [lockedCategories],
  );

  const lockedMap = useMemo(() => {
    const m = new Map<string, LockedCategory>();
    lockedCategories.forEach((l) => m.set(l.categoryId, l));
    return m;
  }, [lockedCategories]);

  const togglePendingCategory = (id: string) => {
    if (lockedIdSet.has(id)) {
      const info = lockedMap.get(id);
      const reason =
        info?.reason === "orders"
          ? "active orders"
          : info?.reason === "products"
          ? "existing products"
          : "existing products and active orders";
      toast.warning(
        `Cannot uncheck — this category has ${reason} linked to the store.`,
      );
      return;
    }
    setPendingCategoryIds((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id],
    );
  };

  const saveCategoryChanges = async () => {
    if (!viewing) return;
    setSavingCategories(true);
    const result = await runServerAction(
      setStoreCategories,
      viewing.store.id,
      pendingCategoryIds,
    );
    if (result.ok) {
      setAssignedIds(pendingCategoryIds);
      setEditingCategories(false);
      toast.success("Store categories updated");
    } else {
      toast.error(result.error.message);
    }
    setSavingCategories(false);
  };

  const parents = categories
    .filter((c) => !c.parent_id)
    .sort((a, b) => a.name.localeCompare(b.name));
  const childrenByParent = new Map<string, CategoryOption[]>();
  categories.forEach((c) => {
    if (c.parent_id) {
      const list = childrenByParent.get(c.parent_id) ?? [];
      list.push(c);
      childrenByParent.set(c.parent_id, list);
    }
  });

  return (
    <div>
      <div className="d-flex flex-wrap gap-2 align-items-center justify-content-between mb-3">
        <h5 className="mb-0">All Stores ({filtered.length})</h5>
        <div className="d-flex gap-2">
          <input
            type="text"
            className="form-control form-control-sm"
            placeholder="Search stores..."
            style={{ width: 200 }}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {actionPerms?.canCreate && (
            <Link href="/settings?new=true" className="btn btn-primary btn-sm">
              <Icon icon="ri:add-line" width={16} className="me-1" />Add Store
            </Link>
          )}
        </div>
      </div>

      <div className="table-responsive">
        <table className="table table-hover align-middle mb-0">
          <thead className="table-light">
            <tr>
              <th>Name</th>
              <th>Slug</th>
              <th>Phone</th>
              <th>City</th>
              <th className="text-center">Open</th>
              <th className="text-center">Active</th>
              <th className="text-center" style={{ width: 140 }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={7} className="text-center text-muted py-4">No stores found</td></tr>
            )}
            {filtered.map((store) => (
              <tr key={store.id}>
                <td>
                  <span className="fw-semibold">
                    {store.logo_url && (
                      <img src={store.logo_url} alt="" className="me-2 rounded" style={{ width: 24, height: 24, objectFit: "cover" }} />
                    )}
                    {store.name}
                  </span>
                </td>
                <td><code className="small">{store.slug}</code></td>
                <td>{store.phone ?? "\u2014"}</td>
                <td>{store.city ?? "\u2014"}</td>
                <td className="text-center">
                  <span className={`badge ${store.is_open ? "bg-success" : "bg-secondary"}`}>
                    {store.is_open ? "Yes" : "No"}
                  </span>
                </td>
                <td className="text-center">
                  <span className={`badge ${store.is_active ? "bg-success" : "bg-secondary"}`}>
                    {store.is_active ? "Yes" : "No"}
                  </span>
                </td>
                <td className="text-center">
                  <div className="d-flex gap-1 justify-content-center">
                    <button className="btn btn-sm btn-outline-info" title="View" onClick={() => openView(store)}>
                      <Icon icon="ri:eye-line" width={15} />
                    </button>
                    {actionPerms?.canEdit && (
                      <Link href={`/settings?store_id=${store.id}`} className="btn btn-sm btn-outline-primary" title="Edit">
                        <Icon icon="ri:pencil-line" width={15} />
                      </Link>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {viewing && (
        <Modal title={viewing.store.name} onClose={() => setViewing(null)}>
          {viewing.store.logo_url && (
            <div className="text-center mb-3">
              <img src={viewing.store.logo_url} alt="Logo" className="border rounded" style={{ maxHeight: 80 }} />
            </div>
          )}
          <DetailRow label="Name" value={viewing.store.name} />
          <DetailRow label="Slug" value={<code>{viewing.store.slug}</code>} />
          <DetailRow label="Phone" value={viewing.store.phone} />
          <DetailRow label="Email" value={viewing.store.email} />
          <DetailRow label="Address" value={viewing.store.address} />
          <DetailRow label="City" value={viewing.store.city} />
          <DetailRow label="State" value={viewing.store.state} />
          <DetailRow label="Delivery Radius" value={viewing.store.delivery_radius_km ? `${viewing.store.delivery_radius_km} km` : null} />
          <DetailRow label="Commission Rate" value={viewing.store.commission_rate ? `${viewing.store.commission_rate}%` : null} />
          <DetailRow label="Open" value={
            <span className={`badge ${viewing.store.is_open ? "bg-success" : "bg-secondary"}`}>
              {viewing.store.is_open ? "Yes" : "No"}
            </span>
          } />
          <DetailRow label="Active" value={
            <span className={`badge ${viewing.store.is_active ? "bg-success" : "bg-secondary"}`}>
              {viewing.store.is_active ? "Yes" : "No"}
            </span>
          } />
          <DetailRow label="Created" value={new Date(viewing.store.created_at).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })} />
          <DetailRow label="Last Updated" value={new Date(viewing.store.updated_at).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })} />

          {/* P49: per-store drill-down — 4 summary cards + 4 scrollable
              tables (orders, customers, invoices, products). Data is
              fetched lazily on modal open. While loading, show a
              spinner. On error, the cards/tables show empty data
              (the categories + edit-stuff above still work). */}

          {viewing.loadingRelations || !viewing.relations ? (
            <div className="text-center text-muted small py-3" data-testid="store-relations-loading">
              <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true" />
              Loading store data...
            </div>
          ) : (
            <StoreRelationsSections relations={viewing.relations} />
          )}

          <div className="row mb-2 mt-2">
            <div className="col-4 text-muted small d-flex align-items-center">
              Categories
              {isSuperAdmin && !editingCategories && categories.length > 0 && (
                <button
                  type="button"
                  className="btn btn-link btn-sm p-0 ms-2"
                  onClick={() => {
                    setPendingCategoryIds(assignedIds);
                    setEditingCategories(true);
                  }}
                >
                  <Icon icon="ri:edit-line" width={13} /> Edit
                </button>
              )}
            </div>
            <div className="col-8">
              {loadingAssigned ? (
                <span className="text-muted small">Loading...</span>
              ) : editingCategories ? (
                <CategoryEditor
                  parents={parents}
                  childrenByParent={childrenByParent}
                  selected={pendingCategoryIds}
                  lockedMap={lockedMap}
                  onToggle={togglePendingCategory}
                />
              ) : assignedIds.length === 0 ? (
                <span className="text-muted small">No categories assigned (all available)</span>
              ) : (
                <div>
                  <div className="d-flex flex-wrap gap-1">
                    {assignedIds.map((id) => {
                      const cat = categories.find((c) => c.id === id);
                      if (!cat) return null;
                      const lock = lockedMap.get(id);
                      return (
                        <span
                          key={id}
                          className={`badge ${lock ? "bg-warning-subtle text-warning" : "bg-primary bg-opacity-10 text-primary"}`}
                          title={
                            lock
                              ? `Locked: ${lock.productCount} product(s), ${lock.activeOrderCount} active order(s)`
                              : undefined
                          }
                        >
                          {lock && <Icon icon="ri:lock-line" width={11} className="me-1" />}
                          {cat.name}
                        </span>
                      );
                    })}
                  </div>
                  {lockedCategories.length > 0 && (
                    <div className="form-text mt-1">
                      <Icon icon="ri:lock-line" width={12} className="me-1" />
                      Locked categories have products or active orders and cannot be unassigned.
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {editingCategories && (
            <div className="d-flex gap-2 justify-content-end mt-2">
              <button
                type="button"
                className="btn btn-outline-secondary btn-sm"
                onClick={() => {
                  setEditingCategories(false);
                  setPendingCategoryIds(assignedIds);
                }}
                disabled={savingCategories}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={saveCategoryChanges}
                disabled={savingCategories}
              >
                {savingCategories ? "Saving..." : "Save Categories"}
              </button>
            </div>
          )}

          <div className="d-flex gap-2 justify-content-end mt-3 pt-3 border-top">
            <Link href={`/settings?store_id=${viewing.store.id}`} className="btn btn-primary">
              <Icon icon="ri:pencil-line" width={16} className="me-1" />Edit Store
            </Link>
          </div>
        </Modal>
      )}

    </div>
  );
}

/**
 * P49: Renders the per-store drill-down content inside the view modal.
 * Composed of:
 *   1. A 4-card summary strip (Orders | Customers | Invoices | Products)
 *   2. Four scrollable sections, one per data type. Each is a small
 *      Bootstrap table with the top N rows fetched by getStoreRelations.
 *
 * Kept as a separate component so the parent modal stays readable and
 * the test surface is small.
 */
function StoreRelationsSections({ relations }: { relations: StoreRelations }) {
  const fmtMoney = (n: number) => `₹${n.toLocaleString("en-IN")}`;
  const fmtDateTime = (s: string) => new Date(s).toLocaleString("en-IN");

  return (
    <div className="mt-3" data-testid="store-relations-sections">
      {/* Summary strip — 4 small cards */}
      <div className="row g-2 mb-3">
        <SummaryStat label="Orders" value={relations.orderCount} icon="ri:shopping-cart-2-line" />
        <SummaryStat label="Customers" value={relations.customerCount} icon="ri:user-line" />
        <SummaryStat label="Invoices" value={relations.invoiceCount} icon="ri:file-text-line" />
        <SummaryStat label="Products" value={relations.productCount} icon="ri:box-3-line" />
      </div>

      {/* Recent orders (showing 10 of {orderCount}) */}
      <div className="mb-3">
        <h6 className="text-muted small mb-2">
          Recent Orders
          {relations.orderCount > relations.orders.length && (
            <span className="ms-1">(showing {relations.orders.length} of {relations.orderCount})</span>
          )}
        </h6>
        {relations.orders.length === 0 ? (
          <div className="text-muted small">No orders</div>
        ) : (
          <div className="table-responsive" style={{ maxHeight: 240 }}>
            <table className="table table-sm table-bordered mb-0 align-middle">
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
                  <tr key={o.id} data-testid={`store-order-row-${o.id}`}>
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
          </div>
        )}
      </div>

      {/* Top customers (showing {len} of {count}) */}
      <div className="mb-3">
        <h6 className="text-muted small mb-2">
          Top Customers
          {relations.customerCount > relations.customers.length && (
            <span className="ms-1">(showing {relations.customers.length} of {relations.customerCount})</span>
          )}
        </h6>
        {relations.customers.length === 0 ? (
          <div className="text-muted small">No customers</div>
        ) : (
          <div className="table-responsive" style={{ maxHeight: 200 }}>
            <table className="table table-sm table-bordered mb-0 align-middle">
              <thead className="table-light position-sticky top-0">
                <tr>
                  <th>Name</th>
                  <th>Phone</th>
                  <th>Email</th>
                  <th className="text-center">Orders</th>
                </tr>
              </thead>
              <tbody>
                {relations.customers.map((c: StoreCustomerRow) => (
                  <tr key={c.id}>
                    <td>{c.full_name ?? "—"}</td>
                    <td className="text-muted small">{c.phone ?? "—"}</td>
                    <td className="text-muted small">{c.email ?? "—"}</td>
                    <td className="text-center">
                      <span className="badge bg-primary bg-opacity-10 text-primary">
                        {c.order_count}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Recent invoices (showing 10 of {count}) */}
      <div className="mb-3">
        <h6 className="text-muted small mb-2">
          Recent Invoices
          {relations.invoiceCount > relations.invoices.length && (
            <span className="ms-1">(showing {relations.invoices.length} of {relations.invoiceCount})</span>
          )}
        </h6>
        {relations.invoices.length === 0 ? (
          <div className="text-muted small">No invoices</div>
        ) : (
          <div className="table-responsive" style={{ maxHeight: 240 }}>
            <table className="table table-sm table-bordered mb-0 align-middle">
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
                  <tr key={i.id}>
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
                    <td className="text-muted small">{fmtDateTime(i.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Products (showing 20 of {count}) */}
      <div className="mb-3">
        <h6 className="text-muted small mb-2">
          Products
          {relations.productCount > relations.products.length && (
            <span className="ms-1">(showing {relations.products.length} of {relations.productCount})</span>
          )}
        </h6>
        {relations.products.length === 0 ? (
          <div className="text-muted small">No products</div>
        ) : (
          <div className="table-responsive" style={{ maxHeight: 240 }}>
            <table className="table table-sm table-bordered mb-0 align-middle">
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
                  <tr key={p.id}>
                    <td>
                      <Link href={`/products/${p.id}`} className="text-decoration-none">
                        {p.name}
                      </Link>
                    </td>
                    <td className="text-muted small"><code>{p.sku ?? "—"}</code></td>
                    <td className="text-end">{fmtMoney(p.mrp)}</td>
                    <td className="text-end">{p.stock_quantity}</td>
                    <td>
                      <span className={`badge ${p.status === "active" ? "bg-success-subtle text-success" : "bg-secondary-subtle text-secondary"} text-capitalize`}>
                        {p.status.replace("_", " ")}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function SummaryStat({ label, value, icon }: { label: string; value: number; icon: string }) {
  return (
    <div className="col-3">
      <div className="card border-0 bg-light h-100">
        <div className="card-body p-2 text-center">
          <Icon icon={icon} className="text-muted" style={{ fontSize: 18 }} />
          <div className="fw-bold fs-5 mt-1">{value.toLocaleString()}</div>
          <div className="text-muted small">{label}</div>
        </div>
      </div>
    </div>
  );
}

function CategoryEditor({
  parents,
  childrenByParent,
  selected,
  lockedMap,
  onToggle,
}: {
  parents: CategoryOption[];
  childrenByParent: Map<string, CategoryOption[]>;
  selected: string[];
  lockedMap: Map<string, LockedCategory>;
  onToggle: (id: string) => void;
}) {
  const renderRow = (cat: CategoryOption, isChild: boolean) => {
    const lock = lockedMap.get(cat.id);
    const isLocked = Boolean(lock);
    const lockReason = lock
      ? lock.reason === "orders"
        ? `${lock.activeOrderCount} active order(s)`
        : lock.reason === "products"
        ? `${lock.productCount} product(s)`
        : `${lock.productCount} product(s), ${lock.activeOrderCount} active order(s)`
      : "";
    return (
      <div className="form-check" key={cat.id}>
        <input
          type="checkbox"
          className="form-check-input"
          id={`store-modal-cat-${cat.id}`}
          checked={isLocked ? true : selected.includes(cat.id)}
          disabled={isLocked}
          onChange={() => onToggle(cat.id)}
        />
        <label
          className={`form-check-label ${isChild ? "small" : "fw-semibold"}`}
          htmlFor={`store-modal-cat-${cat.id}`}
          title={isLocked ? `Locked — has ${lockReason}` : undefined}
        >
          {isLocked && (
            <Icon
              icon="ri:lock-line"
              width={isChild ? 11 : 13}
              className="me-1 text-warning"
            />
          )}
          {cat.name}
          {isLocked && (
            <span className="text-muted small ms-1">(locked)</span>
          )}
        </label>
      </div>
    );
  };

  return (
    <div
      className="border rounded p-2"
      style={{ maxHeight: 240, overflowY: "auto", background: "#fafafa" }}
    >
      {parents.length === 0 && (
        <div className="text-muted small p-2">No categories available</div>
      )}
      {parents.map((parent) => {
        const children = (childrenByParent.get(parent.id) ?? [])
          .slice()
          .sort((a, b) => a.name.localeCompare(b.name));
        return (
          <div key={parent.id} className="mb-2">
            {renderRow(parent, false)}
            {children.length > 0 && (
              <div className="ms-4 mt-1">
                {children.map((child) => renderRow(child, true))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
