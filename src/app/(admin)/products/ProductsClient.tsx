"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Icon } from "@iconify/react";
import { toast } from "react-toastify";
import { deleteProduct } from "./actions";
import BulkImportModal from "./BulkImportModal";

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

  const confirmDelete = async () => {
    if (!deleting) return;
    try {
      await deleteProduct(deleting.id);
      toast.success("Product deleted");
      setDeleting(null);
    } catch {
      toast.error("Failed to delete product");
    }
  };

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
          <div className="mb-3">
            <button
              className="btn btn-outline-primary btn-sm"
              onClick={() => setShowImport(true)}
            >
              <Icon icon="ri:upload-2-line" className="me-1" />
              Import CSV
            </button>
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
                          onClick={() => setDeleting(p)}
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
        >
          <div className="bg-white rounded-3 shadow" style={{ width: 420 }}>
            <div className="px-4 py-3 border-bottom">
              <h6 className="fw-bold mb-0">Delete Product</h6>
            </div>
            <div className="p-4">
              <p className="mb-1">Are you sure you want to delete <strong>{deleting.name}</strong>?</p>
              <p className="text-muted small mb-0">This action cannot be undone.</p>
            </div>
            <div className="d-flex justify-content-end gap-2 px-4 py-3 border-top">
              <button className="btn btn-outline-secondary" onClick={() => setDeleting(null)}>
                Cancel
              </button>
              <button className="btn btn-danger" onClick={confirmDelete}>
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
