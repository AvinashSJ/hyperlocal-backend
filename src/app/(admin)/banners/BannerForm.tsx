"use client";

import { useActionState } from "react";
import { createBanner, updateBanner } from "./actions";

type Banner = {
  id: string; name: string; link: string; image_url: string; position: number; is_active: boolean;
};

export default function BannerForm({ banner, onClose }: { banner: Banner | null; onClose: () => void }) {
  const [state, formAction, pending] = useActionState(async (_prev: { error: string | null }, formData: FormData) => {
    try {
      if (banner) {
        await updateBanner(banner.id, formData);
      } else {
        await createBanner(formData);
      }
      onClose();
      return { error: null };
    } catch (e) {
      return { error: e instanceof Error ? e.message : "An error occurred" };
    }
  }, { error: null });

  return (
    <div style={{
      position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.5)", zIndex: 1050,
      display: "flex", alignItems: "center", justifyContent: "center",
    }} onClick={onClose}>
      <div className="card" style={{ width: 480, maxWidth: "90vw" }} onClick={(e) => e.stopPropagation()}>
        <div className="card-header d-flex justify-content-between align-items-center">
          <strong>{banner ? "Edit Banner" : "Add Banner"}</strong>
          <button type="button" className="btn-close" onClick={onClose} />
        </div>
        <form action={formAction}>
          <div className="card-body">
            {state.error && <div className="alert alert-danger py-2">{state.error}</div>}

            <div className="mb-3">
              <label className="form-label">Banner Name <span className="text-danger">*</span></label>
              <input type="text" name="name" className="form-control" defaultValue={banner?.name ?? ""} required />
            </div>

            <div className="mb-3">
              <label className="form-label">Image URL</label>
              <input type="url" name="image_url" className="form-control" defaultValue={banner?.image_url ?? ""} placeholder="https://..." />
              {banner?.image_url && (
                <div className="mt-2">
                  <img src={banner.image_url} alt="preview" style={{ width: 120, height: 68, objectFit: "cover", borderRadius: 4 }} />
                </div>
              )}
            </div>

            <div className="mb-3">
              <label className="form-label">Link URL</label>
              <input type="url" name="link" className="form-control" defaultValue={banner?.link ?? ""} placeholder="https://..." />
            </div>

            <div className="row mb-3">
              <div className="col-6">
                <label className="form-label">Position</label>
                <input type="number" name="position" className="form-control" defaultValue={banner?.position ?? 0} min={0} />
              </div>
              <div className="col-6 d-flex align-items-end">
                <div className="form-check">
                  <input type="checkbox" name="is_active" className="form-check-input" id="bannerActive" defaultChecked={banner?.is_active ?? true} />
                  <label className="form-check-label" htmlFor="bannerActive">Active</label>
                </div>
              </div>
            </div>
          </div>
          <div className="card-footer d-flex gap-2 justify-content-end">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={pending}>
              {pending ? "Saving..." : banner ? "Update Banner" : "Create Banner"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
