"use client";

import { useState, useMemo, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "@iconify/react";
import { toast } from "react-toastify";
import { deleteStore, getStoreRelations } from "./actions";
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

const DELETABLE_CUTOFF = Date.now() - 90 * 24 * 60 * 60 * 1000;

type ActionPermissions = {
  canView: boolean; canCreate: boolean; canEdit: boolean; canDelete: boolean;
};

export default function StoresClient({ stores, actionPerms }: { stores: StoreRow[]; actionPerms?: ActionPermissions }) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [viewing, setViewing] = useState<StoreRow | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [relations, setRelations] = useState<{ zones: number; gstNumbers: number } | null>(null);

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

  const openDelete = useCallback(async (id: string) => {
    try {
      const rels = await getStoreRelations(id);
      setRelations(rels);
      setDeleting(id);
    } catch {
      toast.error("Failed to check store relations");
    }
  }, []);

  const confirmDelete = useCallback(async () => {
    if (!deleting) return;
    try {
      await deleteStore(deleting);
      toast.success("Store deleted");
      setDeleting(null);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete store");
    }
  }, [deleting, router]);

  const isDeletable = (store: StoreRow) => {
    if (store.is_active) return false;
    return new Date(store.updated_at).getTime() < DELETABLE_CUTOFF;
  };

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
                    {actionPerms?.canDelete && isDeletable(store) && (
                      <button className="btn btn-sm btn-outline-danger" title="Delete" onClick={() => openDelete(store.id)}>
                        <Icon icon="ri:delete-bin-6-line" width={15} />
                      </button>
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

      {deleting && (
        <Modal title="Confirm Delete" onClose={() => { setDeleting(null); setRelations(null); }}>
          <p>Are you sure you want to delete this store?</p>
          {relations && (
            <ul className="mb-3">
              {relations.zones > 0 && <li>{relations.zones} delivery zone{relations.zones !== 1 ? "s" : ""} will be deleted</li>}
              {relations.gstNumbers > 0 && <li>{relations.gstNumbers} GST number{relations.gstNumbers !== 1 ? "s" : ""} will be deleted</li>}
            </ul>
          )}
          <p className="text-muted small mb-0">This action cannot be undone.</p>
          <div className="d-flex gap-2 justify-content-end mt-3">
            <button className="btn btn-outline-secondary" onClick={() => { setDeleting(null); setRelations(null); }}>Cancel</button>
            <button className="btn btn-danger" onClick={confirmDelete}>Delete Store</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
