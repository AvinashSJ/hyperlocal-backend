"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Icon } from "@iconify/react";
import { toast } from "react-toastify";
import { runServerAction } from "@/lib/run-server-action";
import {
  deleteProduct,
  getProductActivityTrail,
  type ProductActivityTrail,
} from "./actions";
import BulkImportModal from "./BulkImportModal";
// P63: client-side date renderer. Avoids hydration mismatches caused
// by server/client timezone divergence in toLocaleDateString.
import ClientDate from "@/components/ClientDate";

type Product = {
  id: string;
  name: string;
  sku: string | null;
  category_id: string | null;
  brand: string | null;
  selling_price: number;
  mrp: number;
  stock_quantity: number;
  low_stock_threshold: number | null;
  status: string;
  categories: { name: string } | null;
};

type Category = {
  id: string;
  name: string;
  parent_id: string | null;
  sort_order: number;
};

type ActionPermissions = {
  canView: boolean; canCreate: boolean; canEdit: boolean; canDelete: boolean;
};

const STATUS_BADGE: Record<string, string> = {
  pending: "bg-warning text-dark",
  confirmed: "bg-info text-white",
  processing: "bg-primary text-white",
  shipped: "bg-secondary text-white",
  delivered: "bg-success text-white",
  cancelled: "bg-danger text-white",
  returned: "bg-dark text-white",
};

const INR = (n: number) => `₹${n.toLocaleString("en-IN")}`;

export default function ProductsClient({
  products,
  categories,
  actionPerms,
}: {
  products: Product[];
  categories: Category[];
  actionPerms?: ActionPermissions;
}) {
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [deleting, setDeleting] = useState<Product | null>(null);
  const [trail, setTrail] = useState<ProductActivityTrail | null>(null);
  const [trailLoading, setTrailLoading] = useState(false);
  const [deleting2, setDeleting2] = useState(false);

  const isLowStock = (p: Product) =>
    p.low_stock_threshold != null && p.stock_quantity <= p.low_stock_threshold;

  const filtered = useMemo(() => {
    const childIds = new Set(
      categories.filter((c) => c.parent_id === categoryFilter).map((c) => c.id),
    );
    return products.filter((p) => {
      if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false;
      if (categoryFilter) {
        if (p.category_id !== categoryFilter && !childIds.has(p.category_id ?? "")) {
          return false;
        }
      }
      if (statusFilter && p.status !== statusFilter) return false;
      if (lowStockOnly && !isLowStock(p)) return false;
      return true;
    });
  }, [products, search, categoryFilter, statusFilter, lowStockOnly, categories]);

  const handleDeleteClick = async (p: Product) => {
    setDeleting(p);
    setTrail(null);
    setTrailLoading(true);
    try {
      const t = await getProductActivityTrail(p.id);
      setTrail(t);
    } catch {
      setTrail({
        orders: [],
        orderTracks: [],
        inventoryLog: [],
        summary: { orderCount: 0, totalUnitsSold: 0, totalRevenue: 0, inventoryEvents: 0 },
      });
    } finally {
      setTrailLoading(false);
    }
  };

  const cancelDelete = () => {
    setDeleting(null);
    setTrail(null);
    setTrailLoading(false);
    setDeleting2(false);
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setDeleting2(true);
    const result = await runServerAction(deleteProduct, deleting.id);
    if (result.ok) {
      toast.success("Product deleted");
      cancelDelete();
    } else {
      toast.error(result.error.message);
      setDeleting2(false);
    }
  };

  const hasTrail =
    trail !== null &&
    (trail.orders.length > 0 || trail.inventoryLog.length > 0);

  return (
    <div className="card">
      <div className="card-body">
        <div className="row g-2 mb-3">
          <div className="col-md-4">
            <input
              type="text"
              className="form-control"
              placeholder="Search products..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="col-md-3">
            <select
              className="form-select"
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
            >
              <option value="">All Categories</option>
              {(() => {
                const parents = categories
                  .filter((c) => !c.parent_id)
                  .sort((a, b) => a.name.localeCompare(b.name));
                const childrenByParent = new Map<string, typeof categories>();
                categories.forEach((c) => {
                  if (c.parent_id) {
                    const list = childrenByParent.get(c.parent_id) ?? [];
                    list.push(c);
                    childrenByParent.set(c.parent_id, list);
                  }
                });
                return parents.map((parent) => {
                  const children = (childrenByParent.get(parent.id) ?? [])
                    .slice()
                    .sort((a, b) => a.name.localeCompare(b.name));
                  if (children.length === 0) {
                    return (
                      <option key={parent.id} value={parent.id}>
                        {parent.name}
                      </option>
                    );
                  }
                  return (
                    <optgroup key={parent.id} label={parent.name}>
                      <option value={parent.id}>{parent.name} (incl. subcategories)</option>
                      {children.map((child) => (
                        <option key={child.id} value={child.id}>
                          {"\u2003\u2514\u00A0"}{child.name}
                        </option>
                      ))}
                    </optgroup>
                  );
                });
              })()}
            </select>
          </div>
          <div className="col-md-2">
            <select
              className="form-select"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="">All Status</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="out_of_stock">Out of Stock</option>
            </select>
          </div>
          <div className="col-md-auto d-flex align-items-center">
            <div className="form-check">
              <input
                type="checkbox"
                className="form-check-input"
                id="lowStock"
                checked={lowStockOnly}
                onChange={(e) => setLowStockOnly(e.target.checked)}
              />
              <label className="form-check-label small" htmlFor="lowStock">
                Low Stock Only
              </label>
            </div>
          </div>
        </div>

        {actionPerms?.canCreate && (
          <div className="mb-3 d-flex gap-2">
            <button
              className="btn btn-outline-primary btn-sm"
              onClick={() => setShowImport(true)}
            >
              <Icon icon="ri:upload-2-line" className="me-1" />
              Import CSV
            </button>
            <a
              href="/api/admin/products/export"
              className="btn btn-outline-secondary btn-sm"
              download
              data-testid="download-csv"
            >
              <Icon icon="ri:download-line" className="me-1" />
              Download CSV
            </a>
          </div>
        )}

        <div className="table-responsive">
          <table className="table table-hover mb-0">
            <thead className="table-light">
              <tr>
                <th>Product</th>
                <th>SKU</th>
                <th>Category</th>
                <th>Price</th>
                <th>Stock</th>
                <th>Status</th>
                <th className="text-end">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center text-muted py-4">
                    No products found
                  </td>
                </tr>
              ) : (
                filtered.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <div className="fw-medium">{p.name}</div>
                      {p.brand && (
                        <small className="text-muted">{p.brand}</small>
                      )}
                    </td>
                    <td>
                      <code className="text-muted" style={{ fontSize: "0.8rem" }}>
                        {p.sku ?? "—"}
                      </code>
                    </td>
                    <td>
                      <span className="badge bg-secondary-subtle text-secondary">
                        {p.categories?.name ?? "—"}
                      </span>
                    </td>
                    <td>
                      <span className="fw-medium">₹{p.selling_price}</span>
                      {p.mrp > p.selling_price && (
                        <small className="text-muted text-decoration-line-through ms-1">
                          ₹{p.mrp}
                        </small>
                      )}
                    </td>
                    <td>
                      <span className={isLowStock(p) ? "text-warning fw-semibold" : ""}>
                        {p.stock_quantity}
                        {isLowStock(p) && <Icon icon="ri:alert-line" className="ms-1 text-warning" />}
                      </span>
                    </td>
                    <td>
                      {p.status === "active" ? (
                        <span className="badge bg-success-subtle text-success">Active</span>
                      ) : p.status === "inactive" ? (
                        <span className="badge bg-warning-subtle text-warning">Inactive</span>
                      ) : (
                        <span className="badge bg-danger-subtle text-danger">Out of Stock</span>
                      )}
                    </td>
                    <td className="text-end">
                      {actionPerms?.canEdit && (
                        <Link
                          href={`/products/${p.id}`}
                          className="btn btn-sm btn-outline-primary me-1"
                        >
                          <Icon icon="ri:edit-line" />
                        </Link>
                      )}
                      {actionPerms?.canDelete && (
                        <button
                          className="btn btn-sm btn-outline-danger"
                          onClick={() => handleDeleteClick(p)}
                          data-testid={`delete-product-${p.id}`}
                        >
                          <Icon icon="ri:delete-bin-line" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showImport && (
        <BulkImportModal onClose={() => setShowImport(false)} />
      )}

      {deleting && (
        <div
          className="position-fixed top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center"
          style={{ background: "rgba(0,0,0,0.5)", zIndex: 1050 }}
          onClick={cancelDelete}
          data-testid="product-delete-modal"
        >
          <div
            className="bg-white rounded-3 shadow"
            style={{ width: hasTrail ? 640 : 420, maxWidth: "95vw", maxHeight: "90vh", display: "flex", flexDirection: "column" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-4 py-3 border-bottom d-flex justify-content-between align-items-center">
              <h6 className="fw-bold mb-0">Delete Product</h6>
              <button
                className="btn-close"
                onClick={cancelDelete}
                aria-label="Close"
                data-testid="product-delete-modal-close"
              />
            </div>

            <div className="p-4" style={{ overflowY: "auto" }}>
              {trailLoading ? (
                <div className="text-center py-4 text-muted">
                  <Icon icon="ri:loader-4-line" className="spinner me-2" />
                  Loading activity trail…
                </div>
              ) : !hasTrail ? (
                <>
                  <p className="mb-1">
                    Are you sure you want to delete <strong>{deleting.name}</strong>?
                  </p>
                  <p className="text-muted small mb-0">
                    This product has no associated orders or inventory events.
                    This action cannot be undone.
                  </p>
                </>
              ) : (
                <>
                  <div
                    className="alert alert-warning d-flex align-items-start gap-2 py-2 mb-3"
                    role="alert"
                    data-testid="product-delete-trail-summary"
                  >
                    <Icon icon="ri:alert-line" className="flex-shrink-0 mt-1" />
                    <div className="small">
                      <strong>Activity trail for {deleting.name}:</strong>
                      <div className="mt-1">
                        {trail!.summary.orderCount > 0 && (
                          <>Referenced in {trail!.summary.orderCount} order(s) ({trail!.summary.totalUnitsSold} units sold, {INR(trail!.summary.totalRevenue)} revenue). </>

                        )}
                        {trail!.summary.inventoryEvents > 0 && (
                          <>{trail!.summary.inventoryEvents} inventory event(s).</>
                        )}
                      </div>
                      <div className="mt-1 text-muted">
                        Deleting this product will set <code>product_id = NULL</code> in
                        order_items and inventory_log. Orders themselves are preserved.
                      </div>
                    </div>
                  </div>

                  {trail!.orders.length > 0 && (
                    <div className="mb-3">
                      <h6 className="fw-semibold small text-uppercase text-muted mb-2" style={{ letterSpacing: "0.05em" }}>
                        Orders ({trail!.orders.length})
                      </h6>
                      <div
                        className="border rounded"
                        style={{ maxHeight: 220, overflowY: "auto" }}
                        data-testid="product-delete-trail-orders"
                      >
                        <table className="table table-sm mb-0">
                          <thead className="table-light" style={{ position: "sticky", top: 0 }}>
                            <tr>
                              <th>Order</th>
                              <th>Customer</th>
                              <th>Status</th>
                              <th className="text-end">Qty × Price</th>
                            </tr>
                          </thead>
                          <tbody>
                            {trail!.orders.map((o) => (
                              <tr key={o.orderId + "-" + o.quantity}>
                                <td>
                                  <div className="fw-semibold">{o.orderNumber}</div>
                                  <small className="text-muted">
                                    <ClientDate value={o.placedAt} format="date" />
                                  </small>
                                </td>
                                <td>{o.customerName ?? "—"}</td>
                                <td>
                                  <span className={`badge ${STATUS_BADGE[o.status] ?? "bg-secondary"}`}>
                                    {o.status}
                                  </span>
                                </td>
                                <td className="text-end">
                                  {o.quantity} × {INR(o.unitPrice)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {trail!.inventoryLog.length > 0 && (
                    <div>
                      <h6 className="fw-semibold small text-uppercase text-muted mb-2" style={{ letterSpacing: "0.05em" }}>
                        Inventory log ({trail!.inventoryLog.length})
                      </h6>
                      <div
                        className="border rounded"
                        style={{ maxHeight: 160, overflowY: "auto" }}
                        data-testid="product-delete-trail-inventory"
                      >
                        <table className="table table-sm mb-0">
                          <thead className="table-light" style={{ position: "sticky", top: 0 }}>
                            <tr>
                              <th>Date</th>
                              <th>Reason</th>
                              <th className="text-end">Change</th>
                              <th className="text-end">Balance</th>
                            </tr>
                          </thead>
                          <tbody>
                            {trail!.inventoryLog.map((row) => (
                              <tr key={row.id}>
                                <td className="text-nowrap">
                                  <ClientDate
                                    value={row.createdAt}
                                    format="datetime"
                                    options={{ day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }}
                                  />
                                </td>
                                <td>
                                  <span className="badge bg-secondary-subtle text-secondary">
                                    {row.reasonCode}
                                  </span>
                                  {row.notes && (
                                    <div className="small text-muted">{row.notes}</div>
                                  )}
                                </td>
                                <td className={`text-end fw-semibold ${row.quantityChange < 0 ? "text-danger" : "text-success"}`}>
                                  {row.quantityChange > 0 ? "+" : ""}
                                  {row.quantityChange}
                                </td>
                                <td className="text-end">{row.runningBalance}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="d-flex justify-content-end gap-2 px-4 py-3 border-top">
              <button
                className="btn btn-outline-secondary"
                onClick={cancelDelete}
                disabled={deleting2}
                data-testid="product-delete-cancel"
              >
                Cancel
              </button>
              <button
                className="btn btn-danger"
                onClick={confirmDelete}
                disabled={trailLoading || deleting2}
                data-testid="product-delete-confirm"
              >
                {deleting2 ? (
                  <>
                    <Icon icon="ri:loader-4-line" className="spinner me-1" />
                    Deleting…
                  </>
                ) : (
                  "Delete product"
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
