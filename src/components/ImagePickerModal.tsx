"use client";

import { useState, useEffect, useRef } from "react";
import { Icon } from "@iconify/react";
import { listMedia, type MediaFile } from "@/app/(admin)/media/actions";

type Props = {
  selectedUrls: string[];
  onSelect: (urls: string[]) => void;
  onClose: () => void;
};

export default function ImagePickerModal({ selectedUrls, onSelect, onClose }: Props) {
  const [files, setFiles] = useState<MediaFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [picked, setPicked] = useState<Set<string>>(new Set(selectedUrls));
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const lastSelectedRef = useRef(selectedUrls);

  useEffect(() => {
    if (lastSelectedRef.current !== selectedUrls) {
      lastSelectedRef.current = selectedUrls;
      setPicked(new Set(selectedUrls));
    }
  }, [selectedUrls]);

  // Refresh the file list from storage. Called on mount and after
  // an upload. We keep the `loading` flag set to true on first
  // mount so the initial fetch shows a spinner; subsequent
  // refreshes (post-upload) keep the current grid visible and
  // append the new file to it.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const f = await listMedia();
      if (cancelled) return;
      setFiles(f);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const refresh = async () => {
    const f = await listMedia();
    setFiles(f);
  };

  const toggle = (url: string) => {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(url)) next.delete(url);
      else next.add(url);
      return next;
    });
  };

  // P32: Direct upload from inside the picker. Lets the user add new
  // images while creating a product without first navigating to
  // /media. After a successful upload, refreshes the file list and
  // auto-selects the new images so they appear in the "Add Selected"
  // count and the parent form's image list.
  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;
    setUploading(true);
    setUploadError(null);
    try {
      const fd = new FormData();
      for (const f of Array.from(fileList)) {
        fd.append("files", f);
      }
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const data = await res.json().catch(() => ({} as { uploaded?: string[]; message?: string; error?: string }));
      if (!res.ok && res.status !== 207) {
        throw new Error(data?.error || data?.message || `Upload failed (${res.status})`);
      }
      // Refresh the file list from the storage bucket. New files are
      // returned with their public URLs.
      const fresh = await listMedia();
      setFiles(fresh);
      // Auto-select the freshly uploaded files. The /api/upload
      // response includes the *fileName* (storage key), not the public
      // URL — so we look up each uploaded name in the refreshed list
      // to get the public URL.
      const uploadedNames = new Set<string>(data?.uploaded ?? []);
      const newUrls = fresh
        .filter((f) => uploadedNames.has(f.name))
        .map((f) => f.url);
      if (newUrls.length > 0) {
        setPicked((prev) => {
          const next = new Set(prev);
          for (const url of newUrls) next.add(url);
          return next;
        });
      }
      if (data?.message) {
        // Partial-success path (207 Multi-Status)
        setUploadError(data.message);
      }
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      // Reset the file input so the same file can be re-selected
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0,0,0,0.5)",
        zIndex: 1050,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
      onClick={onClose}
    >
      <div
        className="card"
        style={{ width: 720, maxWidth: "95vw", maxHeight: "85vh" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="card-header d-flex justify-content-between align-items-center">
          <strong>Select Images</strong>
          <button type="button" className="btn-close" onClick={onClose} />
        </div>

        {/* P32: upload bar — directly upload new images from inside
            the picker instead of forcing the user to navigate to
            /media first. The bar stays visible above the file grid
            so the user can keep adding images as they go. */}
        <div className="border-bottom px-3 py-2 d-flex align-items-center gap-2" style={{ background: "#f8f9fa" }}>
          <Icon icon="ri:upload-cloud-2-line" width={20} className="text-primary" />
          <span className="small fw-semibold me-2">Upload images</span>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            multiple
            onChange={handleUpload}
            disabled={uploading}
            className="form-control form-control-sm"
            style={{ maxWidth: 320 }}
            data-testid="image-picker-upload-input"
          />
          {uploading && (
            <span className="small text-muted">
              <Icon icon="ri:loader-4-line" className="spinner me-1" />
              Uploading…
            </span>
          )}
        </div>
        {uploadError && (
          <div className="alert alert-warning py-2 mb-0 rounded-0 small" data-testid="image-picker-upload-error">
            {uploadError}
          </div>
        )}

        <div className="card-body" style={{ overflowY: "auto", maxHeight: "60vh" }}>
          {loading ? (
            <div className="text-center py-5 text-muted">
              <Icon icon="ri:loader-4-line" className="spinner me-1" />
              Loading images...
            </div>
          ) : files.length === 0 ? (
            <div className="text-center py-5 text-muted">
              <Icon icon="ri:image-line" width={48} className="mb-2 opacity-25" />
              <p>No images in library yet.</p>
              <p className="small mb-0">Use the <strong>Upload images</strong> bar above to add some.</p>
            </div>
          ) : (
            <div className="row g-2">
              {files.map((f) => {
                const isSelected = picked.has(f.url);
                return (
                  <div key={f.name} className="col-4 col-md-3">
                    <div
                      className="card"
                      onClick={() => toggle(f.url)}
                      style={{
                        cursor: "pointer",
                        outline: isSelected ? "3px solid #0d6efd" : undefined,
                        borderColor: isSelected ? "#0d6efd" : undefined,
                      }}
                    >
                      <div
                        style={{
                          aspectRatio: "1",
                          overflow: "hidden",
                          background: "#f5f5f5",
                        }}
                      >
                        <img
                          src={f.url}
                          alt={f.name}
                          className="w-100 h-100"
                          style={{ objectFit: "cover" }}
                          loading="lazy"
                        />
                      </div>
                      <div className="p-1">
                        <p className="small text-muted text-truncate mb-0" title={f.name}>
                          {f.name}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="card-footer d-flex justify-content-between align-items-center">
          <span className="text-muted small">{picked.size} selected</span>
          <div className="d-flex gap-2">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => onSelect(Array.from(picked))}
            >
              Add Selected ({picked.size})
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
