"use client";

import { useActionState } from "react";
import { createCategory, updateCategory } from "./actions";
import { Icon } from "@iconify/react";

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
};

export default function CategoryForm({
  category,
  categories,
  onClose,
}: {
  category: Category | null;
  categories: Category[];
  onClose: () => void;
}) {
  const isEditing = !!category;

  const [state, formAction, pending] = useActionState(
    async (_prev: unknown, formData: FormData) => {
      try {
        if (isEditing) {
          await updateCategory(category!.id, formData);
        } else {
          await createCategory(formData);
        }
      } catch (err) {
        return { error: (err as Error).message };
      }
    },
    { error: null as string | null },
  );

  return (
    <div
      className="position-fixed top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center"
      style={{ background: "rgba(0,0,0,0.4)", zIndex: 1050 }}
    >
      <div className="bg-white rounded-3 shadow" style={{ width: 520, maxHeight: "90vh", overflowY: "auto" }}>
        <div className="d-flex justify-content-between align-items-center px-4 py-3 border-bottom">
          <h6 className="fw-bold mb-0">
            {isEditing ? "Edit Category" : "Add Category"}
          </h6>
          <button className="btn-close" onClick={onClose} />
        </div>

        <form action={formAction} className="p-4">
          {state?.error && (
            <div className="alert alert-danger py-2">{state.error}</div>
          )}

          <div className="mb-3">
            <label className="form-label">Name *</label>
            <input
              name="name"
              type="text"
              className="form-control"
              required
              defaultValue={category?.name ?? ""}
            />
          </div>

          <div className="mb-3">
            <label className="form-label">Parent Category</label>
            <select
              name="parent_id"
              className="form-select"
              defaultValue={category?.parent_id ?? ""}
            >
              <option value="">None (Root)</option>
              {categories
                .filter((c) => c.id !== category?.id)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </select>
          </div>

          <div className="mb-3">
            <label className="form-label">Description</label>
            <textarea
              name="description"
              className="form-control"
              rows={3}
              defaultValue={category?.description ?? ""}
            />
          </div>

          <div className="mb-3">
            <label className="form-label">Image URL</label>
            <div className="input-group">
              <input
                name="image_url"
                type="text"
                className="form-control"
                placeholder="https://..."
                defaultValue={category?.image_url ?? ""}
              />
              <button type="button" className="btn btn-outline-secondary" title="Browse Media" onClick={() => window.open("/media", "_blank")}>
                <Icon icon="ri:image-add-line" />
              </button>
            </div>
            {category?.image_url && (
              <div className="mt-2">
                <img src={category.image_url} alt="" style={{ width: 80, height: 80, objectFit: "cover", borderRadius: 8 }} />
              </div>
            )}
          </div>

          <div className="row g-3 mb-3">
            <div className="col-6">
              <label className="form-label">Sort Order</label>
              <input
                name="sort_order"
                type="number"
                className="form-control"
                defaultValue={category?.sort_order ?? 0}
              />
            </div>
            <div className="col-6 d-flex align-items-end">
              <div className="form-check">
                <input
                  name="is_featured"
                  type="checkbox"
                  className="form-check-input"
                  id="is_featured"
                  defaultChecked={category?.is_featured ?? false}
                />
                <label className="form-check-label" htmlFor="is_featured">
                  Featured
                </label>
              </div>
              <div className="form-check ms-3">
                <input
                  name="is_active"
                  type="checkbox"
                  className="form-check-input"
                  id="is_active"
                  defaultChecked={category?.is_active ?? true}
                />
                <label className="form-check-label" htmlFor="is_active">
                  Active
                </label>
              </div>
            </div>
          </div>

          <div className="d-flex justify-content-end gap-2">
            <button type="button" className="btn btn-outline-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={pending}>
              {pending ? (
                <Icon icon="ri:loader-4-line" className="spinner" />
              ) : isEditing ? (
                "Update"
              ) : (
                "Create"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
