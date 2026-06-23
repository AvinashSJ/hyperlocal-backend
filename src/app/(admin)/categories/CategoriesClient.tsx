"use client";

import { useState, useMemo, Fragment } from "react";
import { Icon } from "@iconify/react";
import { toast } from "react-toastify";
import { runServerAction } from "@/lib/run-server-action";
import {
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
  /** Stores directly assigned via store_categories (drives the delete modal). */
  stores: string[];
  /** Stores actually shown in the Stores column (own ∪ parent's, display-only). */
  effective_stores: string[];
  /** True if `effective_stores` includes the parent's contribution. */
  stores_inherited: boolean;
  /** Number of direct subcategories — non-zero blocks parent delete. */
  children_count: number;
};

type ActionPermissions = {
  canView: boolean; canCreate: boolean; canEdit: boolean; canDelete: boolean;
};

/**
 * Indent (px) for nested rows. Kept conservative so the Name column
 * remains readable on smaller widths; 32px per depth level.
 */
const CHILD_INDENT_PX = 32;

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
  // Map of parentId → expanded. Missing key = collapsed (default state).
  // Resets on page refresh per the PR plan — local state only, no
  // URL / localStorage persistence.
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const toggle = (id: string) =>
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));

  // Group categories into a tree. The data has already been sorted by
  // sort_order ASC, name ASC on the server, so we preserve that order
  // within roots and within each parent's children.
  const tree = useMemo(() => {
    const childrenByParent = new Map<string, Category[]>();
    const roots: Category[] = [];
    for (const cat of categories) {
      if (cat.parent_id && categories.some((c) => c.id === cat.parent_id)) {
        const list = childrenByParent.get(cat.parent_id) ?? [];
        list.push(cat);
        childrenByParent.set(cat.parent_id, list);
      } else {
        roots.push(cat);
      }
    }
    return { roots, childrenByParent };
  }, [categories]);

  // P33: when a category has products, deletion is blocked (existing
  // product_count > 0 path). When it has no products, the new modal
  // offers 3 options (Schedule / Force unassign / Force delete) and
  // a Cancel-deletion path when already scheduled.
  // Additionally: parents with subcategories (children_count > 0) cannot
  // be deleted from this page; SA must delete or reassign children first.
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

  const hasChildren = (cat: Category) => cat.children_count > 0;
  const isExpanded = (cat: Category) => Boolean(expanded[cat.id]);

  // Render a single row. `depth` 0 = root, 1 = first-level child, etc.
  const renderRow = (cat: Category, depth: number) => {
    const showCaret = depth === 0 && hasChildren(cat);
    const expandedFlag = showCaret && isExpanded(cat);
    return (
      <Fragment key={cat.id}>
        <tr>
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
          <td
            className="fw-medium"
            style={{ paddingInlineStart: depth * CHILD_INDENT_PX + 12 }}
          >
            <div className="d-flex align-items-center gap-2 flex-wrap">
              {showCaret ? (
                <button
                  type="button"
                  className="btn btn-sm btn-link p-0 text-body"
                  onClick={() => toggle(cat.id)}
                  aria-label={expandedFlag ? "Collapse subcategories" : "Expand subcategories"}
                  aria-expanded={expandedFlag}
                  data-testid={`category-toggle-${cat.id}`}
                  style={{ lineHeight: 1 }}
                >
                  <Icon
                    icon={expandedFlag ? "ri:arrow-down-s-line" : "ri:arrow-right-s-line"}
                    style={{ fontSize: 18 }}
                  />
                </button>
              ) : depth > 0 ? (
                // Connector glyph for visual continuity under the caret
                <span className="text-muted" aria-hidden style={{ width: 18, display: "inline-block" }}>
                  └
                </span>
              ) : null}
              <span>{cat.name}</span>
              {showCaret && (
                <span
                  className="badge bg-light text-muted"
                  data-testid={`category-children-count-${cat.id}`}
                >
                  {cat.children_count} subcategor
                  {cat.children_count === 1 ? "y" : "ies"}
                </span>
              )}
              {cat.pending_deletion_at && (
                <span
                  className="badge bg-warning-subtle text-warning"
                  data-testid={`category-pending-deletion-${cat.id}`}
                >
                  <Icon icon="ri:time-line" className="me-1" />
                  Scheduled for deletion
                </span>
              )}
            </div>
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
            {cat.effective_stores.length > 0 ? (
              <span className="d-inline-flex align-items-center gap-1 flex-wrap">
                <span>{cat.effective_stores.join(", ")}</span>
                {cat.stores_inherited && (
                  <span
                    className="badge bg-info-subtle text-info"
                    title="This category's store list inherits from its parent."
                    data-testid={`category-stores-inherited-${cat.id}`}
                  >
                    inherited
                  </span>
                )}
              </span>
            ) : (
              <span className="text-muted">—</span>
            )}
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
        {showCaret && expandedFlag &&
          (tree.childrenByParent.get(cat.id) ?? []).map((child) =>
            renderRow(child, depth + 1),
          )}
      </Fragment>
    );
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
                {tree.roots.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="text-center text-muted py-4">
                      No categories found
                    </td>
                  </tr>
                ) : (
                  tree.roots.map((root) => renderRow(root, 0))
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
              {deleting.children_count > 0 ? (
                <div
                  className="alert alert-danger py-2 mb-0"
                  data-testid="delete-blocked-children"
                >
                  This category has <strong>{deleting.children_count}</strong>{" "}
                  subcategor{deleting.children_count === 1 ? "y" : "ies"}.
                  Delete or reassign the subcategories first.
                </div>
              ) : deleting.product_count > 0 ? (
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
              {deleting.children_count > 0 ? (
                <button
                  className="btn btn-secondary"
                  disabled
                  data-testid="delete-blocked-children-btn"
                >
                  Delete
                </button>
              ) : deleting.product_count > 0 ? (
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
