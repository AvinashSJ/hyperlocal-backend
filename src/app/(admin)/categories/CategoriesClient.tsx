"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Icon } from "@iconify/react";
import { toast } from "react-toastify";
import { deleteCategory } from "./actions";
import CategoryForm from "./CategoryForm";

type Category = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  image_url: string | null;
  parent_id: string | null;
  is_featured: boolean;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  parent_name?: string | null;
  product_count: number;
  stores: string[];
};

type ActionPermissions = {
  canView: boolean; canCreate: boolean; canEdit: boolean; canDelete: boolean;
};

export default function CategoriesClient({
  categories,
  actionPerms,
}: {
  categories: Category[];
  actionPerms?: ActionPermissions;
}) {
  const [editing, setEditing] = useState<Category | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [deleting, setDeleting] = useState<Category | null>(null);

  const confirmDelete = async () => {
    if (!deleting) return;
    try {
      await deleteCategory(deleting.id);
      toast.success("Category deleted");
      setDeleting(null);
    } catch {
      toast.error("Failed to delete category");
    }
  };

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h4 className="fw-bold mb-0">Categories</h4>
        {actionPerms?.canCreate && (
          <button
            className="btn btn-primary"
            onClick={() => {
              setEditing(null);
              setShowForm(true);
            }}
          >
            <Icon icon="ri:add-line" className="me-1" />
            Add Category
          </button>
        )}
      </div>

      <div className="card">
        <div className="card-body p-0">
          <div className="table-responsive">
            <table className="table table-hover mb-0">
              <thead className="table-light">
                <tr>
                  <th>Image</th>
                  <th>Name</th>
                  <th>Slug</th>
                  <th>Parent</th>
                  <th className="text-center">Featured</th>
                  <th className="text-center">Order</th>
                  <th className="text-center">Status</th>
                  <th className="text-center">Products</th>
                  <th>Stores</th>
                  <th className="text-end">Actions</th>
                </tr>
              </thead>
              <tbody>
                {categories.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="text-center text-muted py-4">
                      No categories found
                    </td>
                  </tr>
                ) : (
                  categories.map((cat) => (
                    <tr key={cat.id}>
                      <td>
                        {cat.image_url ? (
                          <img
                            src={cat.image_url}
                            alt=""
                            width={40}
                            height={40}
                            style={{ objectFit: "cover", borderRadius: 6 }}
                          />
                        ) : (
                          <Icon icon="ri:image-line" className="text-muted" style={{ fontSize: 24 }} />
                        )}
                      </td>
                      <td className="fw-medium">{cat.name}</td>
                      <td>
                        <code className="text-muted" style={{ fontSize: "0.8rem" }}>
                          {cat.slug}
                        </code>
                      </td>
                      <td>
                        {cat.parent_name ? (
                          <span className="text-muted">{cat.parent_name}</span>
                        ) : (
                          <span className="badge bg-secondary-subtle text-secondary">Root</span>
                        )}
                      </td>
                      <td className="text-center">
                        {cat.is_featured ? (
                          <Icon icon="ri:star-fill" className="text-warning" />
                        ) : (
                          <Icon icon="ri:star-line" className="text-muted" />
                        )}
                      </td>
                      <td className="text-center text-muted">{cat.sort_order}</td>
                      <td className="text-center">
                        {cat.is_active ? (
                          <span className="badge bg-success-subtle text-success">Active</span>
                        ) : (
                          <span className="badge bg-danger-subtle text-danger">Inactive</span>
                        )}
                      </td>
                      <td className="text-center">
                        <span className="badge bg-primary bg-opacity-10 text-primary">
                          {cat.product_count}
                        </span>
                      </td>
                      <td style={{ fontSize: "0.85rem" }}>
                        {cat.stores.length > 0 ? cat.stores.join(", ") : <span className="text-muted">—</span>}
                      </td>
                      <td className="text-end">
                        {actionPerms?.canEdit && (
                          <button
                            className="btn btn-sm btn-outline-primary me-1"
                            onClick={() => {
                              setEditing(cat);
                              setShowForm(true);
                            }}
                          >
                            <Icon icon="ri:edit-line" />
                          </button>
                        )}
                        {actionPerms?.canDelete && (
                          <button
                            className="btn btn-sm btn-outline-danger"
                            onClick={() => setDeleting(cat)}
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

      {deleting && (
        <div
          className="position-fixed top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center"
          style={{ background: "rgba(0,0,0,0.5)", zIndex: 1050 }}
        >
          <div className="bg-white rounded-3 shadow" style={{ width: 420 }}>
            <div className="px-4 py-3 border-bottom">
              <h6 className="fw-bold mb-0">Delete Category</h6>
            </div>
            <div className="p-4">
              {deleting.product_count > 0 ? (
                <>
                  <div className="alert alert-warning py-2 mb-2">
                    <strong>{deleting.product_count}</strong> product{deleting.product_count !== 1 ? "s" : ""} use{deleting.product_count === 1 ? "s" : ""} this category.
                  </div>
                  <p className="mb-1">Remove or reassign the products first before deleting this category.</p>
                </>
              ) : (
                <>
                  <p className="mb-1">Are you sure you want to delete <strong>{deleting.name}</strong>?</p>
                  <p className="text-muted small mb-0">This action cannot be undone.</p>
                </>
              )}
            </div>
            <div className="d-flex justify-content-end gap-2 px-4 py-3 border-top">
              <button className="btn btn-outline-secondary" onClick={() => setDeleting(null)}>
                Cancel
              </button>
              {deleting.product_count === 0 && (
                <button className="btn btn-danger" onClick={confirmDelete}>
                  Delete
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {showForm && (
        <CategoryForm
          category={editing}
          categories={categories}
          onClose={() => setShowForm(false)}
        />
      )}
    </div>
  );
}
