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
  const lastSelectedRef = useRef(selectedUrls);

  useEffect(() => {
    if (lastSelectedRef.current !== selectedUrls) {
      lastSelectedRef.current = selectedUrls;
      setPicked(new Set(selectedUrls));
    }
  }, [selectedUrls]);

  useEffect(() => {
    listMedia().then((f) => {
      setFiles(f);
      setLoading(false);
    });
  }, []);

  const toggle = (url: string) => {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(url)) next.delete(url);
      else next.add(url);
      return next;
    });
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

        <div className="card-body" style={{ overflowY: "auto", maxHeight: "60vh" }}>
          {loading ? (
            <div className="text-center py-5 text-muted">
              <Icon icon="ri:loader-4-line" className="spinner me-1" />
              Loading images...
            </div>
          ) : files.length === 0 ? (
            <div className="text-center py-5 text-muted">
              <Icon icon="ri:image-line" width={48} className="mb-2 opacity-25" />
              <p>No images in library. Upload some in the Media section first.</p>
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
