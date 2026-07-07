"use client";

import { useState, useCallback } from "react";
import { Icon } from "@iconify/react";
import { toast } from "react-toastify";
import {
  deleteGstNumber,
  attachGstNumberToStore,
  getStoresForGstAttach,
  type getGstNumbers,
} from "./actions";
import GstForm from "./GstForm";

type GstNumber = Awaited<ReturnType<typeof getGstNumbers>>[number];
type StoreOption = { id: string; name: string; code: string };

type ActionPermissions = {
  canView: boolean; canCreate: boolean; canEdit: boolean; canDelete: boolean;
};

export default function GstClient({ gstNumbers: initial, actionPerms }: { gstNumbers: GstNumber[]; actionPerms?: ActionPermissions }) {
  const [gstNumbers, setGstNumbers] = useState(initial);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<GstNumber | null>(null);
  // P67: attach-to-store state
  const [attaching, setAttaching] = useState<GstNumber | null>(null);
  const [attachStoreId, setAttachStoreId] = useState("");
  const [attachStores, setAttachStores] = useState<StoreOption[]>([]);
  const [attachingBusy, setAttachingBusy] = useState(false);

  const handleDelete = useCallback(async (id: string, gstin: string) => {
    if (!confirm(`Delete GST number "${gstin}"?`)) return;
    try {
      await deleteGstNumber(id);
      setGstNumbers((prev) => prev.filter((g) => g.id !== id));
      toast.success("GST number deleted");
    } catch {
      toast.error("Failed to delete GST number");
    }
  }, []);

  // P67: open the attach modal and load the store list
  const handleAttach = useCallback(async (gst: GstNumber) => {
    setAttaching(gst);
    setAttachStoreId("");
    try {
      const stores = await getStoresForGstAttach();
      setAttachStores(stores);
    } catch {
      toast.error("Failed to load stores");
    }
  }, []);

  const handleAttachCancel = useCallback(() => {
    setAttaching(null);
    setAttachStoreId("");
    setAttachStores([]);
  }, []);

  const handleAttachConfirm = useCallback(async () => {
    if (!attaching || !attachStoreId) return;
    setAttachingBusy(true);
    try {
      await attachGstNumberToStore(attaching.id, attachStoreId);
      // Update local list: set the store_id, clear orphan status
      setGstNumbers((prev) =>
        prev.map((g) =>
          g.id === attaching.id
            ? {
                ...g,
                store_id: attachStoreId,
                is_primary: false,
                stores: attachStores.find((s) => s.id === attachStoreId) ?? g.stores,
              }
            : g,
        ),
      );
      toast.success("GST number attached to store");
      handleAttachCancel();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to attach");
    } finally {
      setAttachingBusy(false);
    }
  }, [attaching, attachStoreId, attachStores, handleAttachCancel]);

  const handleEdit = useCallback((gst: GstNumber) => {
    setEditing(gst);
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
        <h5 className="mb-0">All GST Numbers ({gstNumbers.length})</h5>
        {actionPerms?.canCreate && (
          <button className="btn btn-primary btn-sm" onClick={handleNew}>
            <Icon icon="ri:add-line" width={16} className="me-1" />Add GST Number
          </button>
        )}
      </div>
      <div className="table-responsive">
        <table className="table table-hover align-middle mb-0">
          <thead className="table-light">
            <tr>
              <th>Store</th>
              <th>GSTIN</th>
              <th>Legal Name</th>
              <th>State Code</th>
              <th>Primary</th>
              <th>Status</th>
              <th>Turnover</th>
              <th>Financial Year</th>
              <th className="text-center">Actions</th>
            </tr>
          </thead>
          <tbody>
            {gstNumbers.length === 0 && (
              <tr>
                <td colSpan={9} className="text-center text-muted py-4">No GST numbers yet</td>
              </tr>
            )}
            {gstNumbers.map((gst) => (
              <tr key={gst.id}>
                <td className="fw-semibold">{gst.stores?.name ?? "—"}</td>
                <td className="fw-semibold" style={{ fontFamily: "monospace" }}>{gst.gstin}</td>
                <td>{gst.legal_name}</td>
                <td>{gst.state_code}</td>
                <td>
                  <span className={`badge ${gst.is_primary ? "bg-info" : "bg-light text-muted"}`}>
                    {gst.is_primary ? "Primary" : "—"}
                  </span>
                </td>
                <td>
                  <span className={`badge ${gst.is_active ? "bg-success" : "bg-secondary"}`}>
                    {gst.is_active ? "Active" : "Inactive"}
                  </span>
                </td>
                <td>{gst.current_turnover ? `₹${Number(gst.current_turnover).toLocaleString()}` : "—"}</td>
                <td>{gst.financial_year ?? "—"}</td>
                <td className="text-center">
                  <div className="d-flex gap-1 justify-content-center">
                    {actionPerms?.canEdit && gst.store_id === null && (
                      <button
                        className="btn btn-sm btn-outline-info"
                        title="Attach to store"
                        onClick={() => handleAttach(gst)}
                        data-testid={`gst-attach-btn-${gst.id}`}
                      >
                        <Icon icon="ri:link" width={16} />
                      </button>
                    )}
                    {actionPerms?.canEdit && (
                      <button className="btn btn-sm btn-outline-primary" title="Edit" onClick={() => handleEdit(gst)}>
                        <Icon icon="ri:pencil-line" width={16} />
                      </button>
                    )}
                    {actionPerms?.canDelete && (
                      <button className="btn btn-sm btn-outline-danger" title="Delete" onClick={() => handleDelete(gst.id, gst.gstin)}>
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

      {showForm && <GstForm gstNumber={editing} onClose={handleFormClose} />}

      {/* P67: Attach-to-store modal for orphan GST numbers (store_id IS NULL) */}
      {attaching && (
        <div
          style={{
            position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.5)", zIndex: 1050,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
          onClick={handleAttachCancel}
        >
          <div className="card" style={{ width: 480, maxWidth: "90vw" }} onClick={(e) => e.stopPropagation()}>
            <div className="card-header d-flex justify-content-between align-items-center">
              <strong>Attach GST to Store</strong>
              <button type="button" className="btn-close" onClick={handleAttachCancel} />
            </div>
            <div className="card-body">
              <p className="mb-3">
                Attach <code>{attaching.gstin}</code> to a store. The row will become
                a non-primary GSTIN — promote it to primary later via Edit if needed.
              </p>
              <label className="form-label">Store</label>
              <select
                className="form-select"
                value={attachStoreId}
                onChange={(e) => setAttachStoreId(e.target.value)}
                data-testid="gst-attach-store-select"
              >
                <option value="">-- Select a store --</option>
                {attachStores.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.code})
                  </option>
                ))}
              </select>
            </div>
            <div className="card-footer d-flex gap-2 justify-content-end">
              <button type="button" className="btn btn-secondary" onClick={handleAttachCancel}>
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleAttachConfirm}
                disabled={!attachStoreId || attachingBusy}
                data-testid="gst-attach-confirm"
              >
                {attachingBusy ? "Attaching…" : "Attach"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
