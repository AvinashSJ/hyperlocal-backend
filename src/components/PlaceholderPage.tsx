import { Icon } from "@iconify/react";

export default function PlaceholderPage({ title }: { title: string }) {
  return (
    <div className="d-flex flex-column align-items-center justify-content-center py-5">
      <div
        className="d-flex align-items-center justify-content-center rounded-circle bg-primary bg-opacity-10 mb-3"
        style={{ width: 64, height: 64 }}
      >
        <Icon icon="ri:tool-line" width={28} className="text-primary" />
      </div>
      <h5 className="fw-semibold">{title}</h5>
      <p className="text-muted">This module is coming soon.</p>
    </div>
  );
}
