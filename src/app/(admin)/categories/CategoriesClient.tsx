"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Icon } from "@iconify/react";
import { toast } from "react-toastify";
import { runServerAction } from "@/lib/run-server-action";
import {
  deleteCategory,
  requestCategoryDeletion,
  cancelCategoryDeletion,
  forceUnassignCategory,
  forceDeleteCategory,
} from "./actions";
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
  pending_deletion_at: string | null; // P33
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
  const [busy, setBusy] = useState(false);

  // P33: when a category has products, deletion is blocked (existing
  // product_count > 0 path). When it has no products, the new modal
  // offers 3 options (Schedule / Force unassign / Force delete) and
  // a Cancel-deletion path when already scheduled.
  const confirmDelete = async () => {
    if (!deleting) return;
    setBusy(true);
    const result = await runServerAction(deleteCategory, deleting.id);
    setBusy(false);
    if (result.ok) {
      toast.success("Category deleted");
      setDeleting(null);
    } else {
      toast.error(result.error.message);
    }
  };

  const handleSchedule = async () => {
    if (!deleting) return;
    setBusy(true);
    const fd = new FormData();
    fd.append("id", deleting.id);
    const result = await runServerAction(requestCategoryDeletion, fd);
    setBusy(false);
    if (result.ok) {
      toast.success("Category scheduled for deletion");
      setDeleting(null);
    } else {
      toast.error(result.error.message);
    }
  };

  const handleCancelDeletion = async () => {
    if (!deleting) return;
    setBusy(true);
    const fd = new FormData();
    fd.append("id", deleting.id);
    const result = await runServerAction(cancelCategoryDeletion, fd);
    setBusy(false);
    if (result.ok) {
      toast.success("Deletion cancelled");
      setDeleting(null);
    } else {
      toast.error(result.error.message);
    }
  };

  const handleForceUnassign = async () => {
    if (!deleting) return;
    setBusy(true);
    const fd = new FormData();
    fd.append("id", deleting.id);
    const result = await runServerAction(forceUnassignCategory, fd);
    setBusy(false);
    if (result.ok) {
      toast.success("Category unassigned from all stores");
      setDeleting(null);
    } else {
      toast.error(result.error.message);
    }
  };

  const handleForceDelete = async () => {
    if (!deleting) return;
    setBusy(true);
    const fd = new FormData();
    fd.append("id", deleting.id);
    const result = await runServerAction(forceDeleteCategory, fd);
    setBusy(false);
    if (result.ok) {
      toast.success("Category force-deleted");
      setDeleting(null);
    } else {
      toast.error(result.error.message);
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
                      <td className="fw-medium">
                        {cat.name}
                        {cat.pending_deletion_at && (
                          <div className="mt-1">
                            <span
                              className="badge bg-warning-subtle text-warning"
                              data-testid={`category-pending-deletion-${cat.id}`}
                            >
                              <Icon icon="ri:time-line" className="me-1" />
                              Scheduled for deletion
                            </span>
                          </div>
                        )}
                      </td>
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
          <div className="bg-white rounded-3 shadow" style={{ width: 480 }}>
            <div className="px-4 py-3 border-bottom">
              <h6 className="fw-bold mb-0">Delete Category</h6>
            </div>
            <div className="p-4">
              <p className="mb-2">
                <strong>{deleting.name}</strong>
                {deleting.stores.length > 0 && (
                  <span className="text-muted">
                    {" "}— assigned to {deleting.stores.length} store
                    {deleting.stores.length !== 1 ? "s" : ""}
                  </span>
                )}
                {deleting.stores.length === 0 && (
                  <span className="text-muted">{" "}— unassigned (no stores)</span>
                )}
              </p>
              {deleting.product_count > 0 ? (
                <div className="alert alert-warning py-2 mb-0">
                  <strong>{deleting.product_count}</strong> product
                  {deleting.product_count !== 1 ? "s" : ""} use
                  {deleting.product_count === 1 ? "s" : ""} this category.
                  Remove or reassign the products first.
                </div>
              ) : deleting.pending_deletion_at ? (
                <div className="alert alert-warning py-2 mb-0">
                  Already scheduled for deletion on{" "}
                  {new Date(deleting.pending_deletion_at).toLocaleDateString()}.
                </div>
              ) : (
                <p className="text-muted small mb-0">
                  Choose how to proceed.
                </p>
              )}
            </div>
            <div className="d-flex justify-content-end gap-2 px-4 py-3 border-top flex-wrap">
              <button
                className="btn btn-outline-secondary"
                onClick={() => setDeleting(null)}
                disabled={busy}
              >
                Cancel
              </button>
              {deleting.product_count > 0 ? (
                <button className="btn btn-secondary" disabled>
                  Delete
                </button>
              ) : deleting.pending_deletion_at ? (
                <>
                  <button
                    className="btn btn-outline-warning"
                    onClick={handleCancelDeletion}
                    disabled={busy}
                    data-testid="cancel-deletion-btn"
                  >
                    Cancel deletion
                  </button>
                  <button
                    className="btn btn-danger"
                    onClick={handleForceDelete}
                    disabled={busy}
                    data-testid="force-delete-btn"
                  >
                    Force delete now
                  </button>
                </>
              ) : (
                <>
                  <button
                    className="btn btn-outline-warning"
                    onClick={handleForceUnassign}
                    disabled={busy}
                    title="Immediately remove this category from every store. The category itself stays in the DB and can be reassigned by Super Admin later."
                    data-testid="force-unassign-btn"
                  >
                    Force unassign
                  </button>
                  <button
                    className="btn btn-outline-primary"
                    onClick={handleSchedule}
                    disabled={busy}
                    data-testid="schedule-deletion-btn"
                  >
                    Schedule deletion
                  </button>
                  <button
                    className="btn btn-danger"
                    onClick={handleForceDelete}
                    disabled={busy}
                    data-testid="force-delete-btn"
                  >
                    Force delete
                  </button>
                </>
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
