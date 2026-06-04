"use client";

import { useState, useCallback } from "react";
import { Icon } from "@iconify/react";
import { toast } from "react-toastify";
import {
  deleteBanner, reorderBanners,
  type getBanners,
} from "./actions";
import BannerForm from "./BannerForm";

type Banner = Awaited<ReturnType<typeof getBanners>>[number];

type ActionPermissions = {
  canView: boolean; canCreate: boolean; canEdit: boolean; canDelete: boolean;
};

export default function BannersClient({ banners: initial, actionPerms }: { banners: Banner[]; actionPerms?: ActionPermissions }) {
  const [banners, setBanners] = useState(initial);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Banner | null>(null);

  const handleReorder = useCallback(async (id: string, direction: "up" | "down") => {
    const idx = banners.findIndex((b) => b.id === id);
    if (idx === -1) return;
    const newIdx = direction === "up" ? idx - 1 : idx + 1;
    if (newIdx < 0 || newIdx >= banners.length) return;

    const reordered = [...banners];
    [reordered[idx], reordered[newIdx]] = [reordered[newIdx], reordered[idx]];
    const updates = reordered.map((b, i) => ({ id: b.id, position: i }));
    setBanners(reordered);
    try {
      await reorderBanners(updates);
      toast.success("Banners reordered");
    } catch {
      setBanners(initial);
      toast.error("Failed to reorder");
    }
  }, [banners, initial]);

  const handleDelete = useCallback(async (id: string, name: string) => {
    if (!confirm(`Delete banner "${name}"?`)) return;
    try {
      await deleteBanner(id);
      setBanners((prev) => prev.filter((b) => b.id !== id));
      toast.success("Banner deleted");
    } catch {
      toast.error("Failed to delete banner");
    }
  }, []);

  const handleEdit = useCallback((banner: Banner) => {
    setEditing(banner);
    setShowForm(true);
  }, []);

  const handleNew = useCallback(() => {
    setEditing(null);
    setShowForm(true);
  }, []);

  const handleFormClose = useCallback(() => {
    setShowForm(false);
    setEditing(null);
  }, []);

  return (
    <>
      <div className="d-flex flex-wrap gap-2 align-items-center justify-content-between mb-3">
        <h5 className="mb-0">All Banners ({banners.length})</h5>
        {actionPerms?.canCreate && (
          <button className="btn btn-primary btn-sm" onClick={handleNew}>
            <Icon icon="ri:add-line" width={16} className="me-1" />Add Banner
          </button>
        )}
      </div>
      <div className="table-responsive">
        <table className="table table-hover align-middle mb-0">
          <thead className="table-light">
            <tr>
              <th style={{ width: 60 }}>Order</th>
              <th>Preview</th>
              <th>Name</th>
              <th>Link</th>
              <th>Status</th>
              <th className="text-center">Actions</th>
            </tr>
          </thead>
          <tbody>
            {banners.length === 0 && (
              <tr>
                <td colSpan={6} className="text-center text-muted py-4">No banners yet</td>
              </tr>
            )}
            {banners.map((banner, i) => (
              <tr key={banner.id}>
                <td>
                  <div className="d-flex flex-column align-items-center gap-1">
                    <button
                      className="btn btn-sm btn-outline-secondary py-0 px-1"
                      disabled={i === 0}
                      onClick={() => handleReorder(banner.id, "up")}
                      title="Move up"
                    >
                      <Icon icon="ri:arrow-up-s-line" width={16} />
                    </button>
                    <span className="small text-muted">{banner.position}</span>
                    <button
                      className="btn btn-sm btn-outline-secondary py-0 px-1"
                      disabled={i === banners.length - 1}
                      onClick={() => handleReorder(banner.id, "down")}
                      title="Move down"
                    >
                      <Icon icon="ri:arrow-down-s-line" width={16} />
                    </button>
                  </div>
                </td>
                <td>
                  {banner.image_url ? (
                    <img src={banner.image_url} alt={banner.name} style={{ width: 80, height: 45, objectFit: "cover", borderRadius: 4 }} />
                  ) : (
                    <div style={{ width: 80, height: 45, backgroundColor: "#f0f0f0", borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <Icon icon="ri:image-line" width={20} className="text-muted" />
                    </div>
                  )}
                </td>
                <td className="fw-semibold">{banner.name}</td>
                <td style={{ maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {banner.link ? <a href={banner.link} target="_blank" rel="noopener noreferrer" className="text-decoration-none">{banner.link}</a> : "—"}
                </td>
                <td>
                  <span className={`badge ${banner.is_active ? "bg-success" : "bg-secondary"}`}>
                    {banner.is_active ? "Active" : "Inactive"}
                  </span>
                </td>
                <td className="text-center">
                  <div className="d-flex gap-1 justify-content-center">
                    {actionPerms?.canEdit && (
                      <button className="btn btn-sm btn-outline-primary" title="Edit" onClick={() => handleEdit(banner)}>
                        <Icon icon="ri:pencil-line" width={16} />
                      </button>
                    )}
                    {actionPerms?.canDelete && (
                      <button className="btn btn-sm btn-outline-danger" title="Delete" onClick={() => handleDelete(banner.id, banner.name)}>
                        <Icon icon="ri:delete-bin-6-line" width={16} />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showForm && <BannerForm banner={editing} onClose={handleFormClose} />}
    </>
  );
}
