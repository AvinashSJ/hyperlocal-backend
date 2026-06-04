"use client";

import { useState, useCallback } from "react";
import { Icon } from "@iconify/react";
import { toast } from "react-toastify";
import { deleteGstNumber, type getGstNumbers } from "./actions";
import GstForm from "./GstForm";

type GstNumber = Awaited<ReturnType<typeof getGstNumbers>>[number];

type ActionPermissions = {
  canView: boolean; canCreate: boolean; canEdit: boolean; canDelete: boolean;
};

export default function GstClient({ gstNumbers: initial, actionPerms }: { gstNumbers: GstNumber[]; actionPerms?: ActionPermissions }) {
  const [gstNumbers, setGstNumbers] = useState(initial);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<GstNumber | null>(null);

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
    </>
  );
}
