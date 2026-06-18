"use client";

import { useState, useCallback } from "react";
import { Icon } from "@iconify/react";
import { toast } from "react-toastify";
import { useDropzone } from "react-dropzone";
import { listMedia, deleteMedia, type MediaFile } from "./actions";

export default function MediaClient({ initialFiles, canUpload, canDelete }: { initialFiles: MediaFile[]; canUpload?: boolean; canDelete?: boolean }) {
  const [files, setFiles] = useState(initialFiles);
  const [uploading, setUploading] = useState(false);

  const refresh = useCallback(async () => {
    const updated = await listMedia();
    setFiles(updated);
  }, []);

  const onDrop = useCallback(async (accepted: File[]) => {
    if (accepted.length === 0) return;
    setUploading(true);
    try {
      const fd = new FormData();
      for (const f of accepted) fd.append("files", f);
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok || (data.errors && data.errors.length > 0)) {
        throw new Error(data.message || data.error || "Upload failed");
      }
      toast.success(`${accepted.length} file(s) uploaded`);
      await refresh();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setUploading(false);
    }
  }, [refresh]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "image/*": [".png", ".jpg", ".jpeg", ".webp"] },
    multiple: true,
  });

  const handleDelete = async (name: string) => {
    if (!confirm("Delete this image?")) return;
    try {
      await deleteMedia(name);
      toast.success("Deleted");
      refresh();
    } catch {
      toast.error("Failed to delete");
    }
  };

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h4 className="fw-bold mb-0">Media Library</h4>
      </div>

      {canUpload && (
        <div
          {...getRootProps()}
          className="card mb-4"
          style={{
            border: isDragActive ? "2px dashed #0d6efd" : "2px dashed #dee2e6",
            background: isDragActive ? "#f0f7ff" : "#fafafa",
            cursor: "pointer",
            transition: "all 0.2s",
          }}
        >
          <div className="card-body text-center py-5">
            <input {...getInputProps()} />
            <Icon icon="ri:upload-cloud-2-line" width={48} className="text-muted mb-3" />
            <p className="mb-1 fw-medium">
              {isDragActive ? "Drop images here" : "Drag & drop images here, or click to browse"}
            </p>
            <p className="text-muted small mb-0">PNG, JPG, WebP up to 5MB each</p>
            {uploading && (
              <div className="mt-3 text-primary">
                <Icon icon="ri:loader-4-line" className="spinner me-1" />
                Uploading...
              </div>
            )}
          </div>
        </div>
      )}

      {files.length === 0 ? (
        <div className="text-center text-muted py-5">
          <Icon icon="ri:image-line" width={64} className="mb-3 opacity-25" />
          <p>No images uploaded yet</p>
        </div>
      ) : (
        <div className="row g-3">
          {files.map((f) => (
            <div key={f.name} className="col-6 col-md-4 col-lg-3 col-xl-2">
              <div className="card h-100">
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
                <div className="card-body p-2">
                  <p
                    className="small text-muted mb-1 text-truncate"
                    title={f.name}
                  >
                    {f.name}
                  </p>
                  {canDelete && (
                    <div className="d-flex gap-1">
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-danger flex-grow-1"
                        onClick={() => handleDelete(f.name)}
                        title="Delete"
                      >
                        <Icon icon="ri:delete-bin-line" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
