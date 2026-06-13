"use client";

import { useState, useMemo, useCallback } from "react";
import Link from "next/link";
import { Icon } from "@iconify/react";
import type { StoreRow } from "./actions";

function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div
      style={{
        position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.5)", zIndex: 1050,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
      onClick={onClose}
    >
      <div className="card" style={{ width: 600, maxWidth: "90vw", maxHeight: "90vh", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
        <div className="card-header d-flex justify-content-between align-items-center">
          <strong>{title}</strong>
          <button type="button" className="btn-close" onClick={onClose} />
        </div>
        <div className="card-body">{children}</div>
      </div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="row mb-2">
      <div className="col-4 text-muted small">{label}</div>
      <div className="col-8">{value ?? "\u2014"}</div>
    </div>
  );
}

type ActionPermissions = {
  canView: boolean; canCreate: boolean; canEdit: boolean; canDelete: boolean;
};

export default function StoresClient({ stores, actionPerms }: { stores: StoreRow[]; actionPerms?: ActionPermissions }) {
  const [search, setSearch] = useState("");
  const [viewing, setViewing] = useState<StoreRow | null>(null);

  const filtered = useMemo(() => {
    if (!search) return stores;
    const q = search.toLowerCase();
    return stores.filter((s) =>
      s.name.toLowerCase().includes(q) ||
      (s.slug?.toLowerCase() ?? "").includes(q) ||
      (s.phone ?? "").includes(q) ||
      (s.city?.toLowerCase() ?? "").includes(q) ||
      (s.email?.toLowerCase() ?? "").includes(q)
    );
  }, [stores, search]);

  const openView = useCallback((store: StoreRow) => setViewing(store), []);

  return (
    <div>
      <div className="d-flex flex-wrap gap-2 align-items-center justify-content-between mb-3">
        <h5 className="mb-0">All Stores ({filtered.length})</h5>
        <div className="d-flex gap-2">
          <input
            type="text"
            className="form-control form-control-sm"
            placeholder="Search stores..."
            style={{ width: 200 }}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {actionPerms?.canCreate && (
            <Link href="/settings?new=true" className="btn btn-primary btn-sm">
              <Icon icon="ri:add-line" width={16} className="me-1" />Add Store
            </Link>
          )}
        </div>
      </div>

      <div className="table-responsive">
        <table className="table table-hover align-middle mb-0">
          <thead className="table-light">
            <tr>
              <th>Name</th>
              <th>Slug</th>
              <th>Phone</th>
              <th>City</th>
              <th className="text-center">Open</th>
              <th className="text-center">Active</th>
              <th className="text-center" style={{ width: 140 }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={7} className="text-center text-muted py-4">No stores found</td></tr>
            )}
            {filtered.map((store) => (
              <tr key={store.id}>
                <td>
                  <span className="fw-semibold">
                    {store.logo_url && (
                      <img src={store.logo_url} alt="" className="me-2 rounded" style={{ width: 24, height: 24, objectFit: "cover" }} />
                    )}
                    {store.name}
                  </span>
                </td>
                <td><code className="small">{store.slug}</code></td>
                <td>{store.phone ?? "\u2014"}</td>
                <td>{store.city ?? "\u2014"}</td>
                <td className="text-center">
                  <span className={`badge ${store.is_open ? "bg-success" : "bg-secondary"}`}>
                    {store.is_open ? "Yes" : "No"}
                  </span>
                </td>
                <td className="text-center">
                  <span className={`badge ${store.is_active ? "bg-success" : "bg-secondary"}`}>
                    {store.is_active ? "Yes" : "No"}
                  </span>
                </td>
                <td className="text-center">
                  <div className="d-flex gap-1 justify-content-center">
                    <button className="btn btn-sm btn-outline-info" title="View" onClick={() => openView(store)}>
                      <Icon icon="ri:eye-line" width={15} />
                    </button>
                    {actionPerms?.canEdit && (
                      <Link href={`/settings?store_id=${store.id}`} className="btn btn-sm btn-outline-primary" title="Edit">
                        <Icon icon="ri:pencil-line" width={15} />
                      </Link>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {viewing && (
        <Modal title={viewing.name} onClose={() => setViewing(null)}>
          {viewing.logo_url && (
            <div className="text-center mb-3">
              <img src={viewing.logo_url} alt="Logo" className="border rounded" style={{ maxHeight: 80 }} />
            </div>
          )}
          <DetailRow label="Name" value={viewing.name} />
          <DetailRow label="Slug" value={<code>{viewing.slug}</code>} />
          <DetailRow label="Phone" value={viewing.phone} />
          <DetailRow label="Email" value={viewing.email} />
          <DetailRow label="Address" value={viewing.address} />
          <DetailRow label="City" value={viewing.city} />
          <DetailRow label="State" value={viewing.state} />
          <DetailRow label="Delivery Radius" value={viewing.delivery_radius_km ? `${viewing.delivery_radius_km} km` : null} />
          <DetailRow label="Commission Rate" value={viewing.commission_rate ? `${viewing.commission_rate}%` : null} />
          <DetailRow label="Open" value={
            <span className={`badge ${viewing.is_open ? "bg-success" : "bg-secondary"}`}>
              {viewing.is_open ? "Yes" : "No"}
            </span>
          } />
          <DetailRow label="Active" value={
            <span className={`badge ${viewing.is_active ? "bg-success" : "bg-secondary"}`}>
              {viewing.is_active ? "Yes" : "No"}
            </span>
          } />
          <DetailRow label="Created" value={new Date(viewing.created_at).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })} />
          <DetailRow label="Last Updated" value={new Date(viewing.updated_at).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })} />
          <div className="d-flex gap-2 justify-content-end mt-3 pt-3 border-top">
            <Link href={`/settings?store_id=${viewing.id}`} className="btn btn-primary">
              <Icon icon="ri:pencil-line" width={16} className="me-1" />Edit Store
            </Link>
          </div>
        </Modal>
      )}

    </div>
  );
}
