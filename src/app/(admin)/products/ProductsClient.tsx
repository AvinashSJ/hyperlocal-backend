"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Icon } from "@iconify/react";
import { toast } from "react-toastify";
import { deleteProduct } from "./actions";

type Product = {
  id: string;
  name: string;
  sku: string | null;
  category_id: string | null;
  brand: string | null;
  selling_price: number;
  mrp: number;
  stock_quantity: number;
  status: string;
  categories: { name: string } | null;
};

type Category = {
  id: string;
  name: string;
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

  const filtered = useMemo(() => {
    return products.filter((p) => {
      if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false;
      if (categoryFilter && p.category_id !== categoryFilter) return false;
      if (statusFilter && p.status !== statusFilter) return false;
      return true;
    });
  }, [products, search, categoryFilter, statusFilter]);

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this product?")) return;
    try {
      await deleteProduct(id);
      toast.success("Product deleted");
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
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
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
        </div>

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
                    <td>{p.stock_quantity}</td>
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
                          onClick={() => handleDelete(p.id)}
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
    </div>
  );
}
