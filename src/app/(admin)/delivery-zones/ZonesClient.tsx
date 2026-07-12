"use client";

import { useState, useCallback } from "react";
import { Icon } from "@iconify/react";
import { toast } from "react-toastify";
import { deleteDeliveryZone, type getDeliveryZones } from "./actions";
import ZoneForm from "./ZoneForm";

type Zone = Awaited<ReturnType<typeof getDeliveryZones>>[number];

type ActionPermissions = {
  canView: boolean; canCreate: boolean; canEdit: boolean; canDelete: boolean;
};

export default function ZonesClient({ zones: initial, actionPerms, storeId }: { zones: Zone[]; actionPerms?: ActionPermissions; storeId?: string | null }) {
  const [zones, setZones] = useState(initial);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Zone | null>(null);

  const handleDelete = useCallback(async (id: string, name: string) => {
    if (!confirm(`Delete zone "${name}"?`)) return;
    try {
      await deleteDeliveryZone(id);
      setZones((prev) => prev.filter((z) => z.id !== id));
      toast.success("Zone deleted");
    } catch {
      toast.error("Failed to delete zone");
    }
  }, []);

  const handleEdit = useCallback((zone: Zone) => {
    setEditing(zone);
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
        <h5 className="mb-0">All Delivery Zones ({zones.length})</h5>
        {actionPerms?.canCreate && (
          <button className="btn btn-primary btn-sm" onClick={handleNew}>
            <Icon icon="ri:add-line" width={16} className="me-1" />Add Zone
          </button>
        )}
      </div>
      <div className="table-responsive">
        <table className="table table-hover align-middle mb-0">
          <thead className="table-light">
            <tr>
              <th>Name</th>
              <th>Pincodes</th>
              <th>Radius (km)</th>
              <th>Delivery Charge</th>
              <th>Free Min Order</th>
              <th>Status</th>
              <th className="text-center">Actions</th>
            </tr>
          </thead>
          <tbody>
            {zones.length === 0 && (
              <tr>
                <td colSpan={7} className="text-center text-muted py-4">No delivery zones yet</td>
              </tr>
            )}
            {zones.map((zone) => (
              <tr key={zone.id}>
                <td className="fw-semibold">{zone.name}</td>
                <td style={{ maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {zone.pincodes?.length ? zone.pincodes.join(", ") : "\u2014"}
                </td>
                <td>{zone.radius_km}</td>
                <td>${Number(zone.delivery_charge).toFixed(2)}</td>
                <td>${Number(zone.free_delivery_min_order).toFixed(2)}</td>
                <td>
                  <div className="d-flex gap-1">
                    <span className={`badge ${zone.is_active ? "bg-success" : "bg-secondary"}`}>
                      {zone.is_active ? "Active" : "Inactive"}
                    </span>
                    {zone.is_express && (
                      <span className="badge bg-info">Express</span>
                    )}
                  </div>
                </td>
                <td className="text-center">
                  <div className="d-flex gap-1 justify-content-center">
                    {actionPerms?.canEdit && (
                      <button className="btn btn-sm btn-outline-primary" title="Edit" onClick={() => handleEdit(zone)}>
                        <Icon icon="ri:pencil-line" width={16} />
                      </button>
                    )}
                    {actionPerms?.canDelete && (
                      <button className="btn btn-sm btn-outline-danger" title="Delete" onClick={() => handleDelete(zone.id, zone.name)}>
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

      {showForm && <ZoneForm zone={editing} onClose={handleFormClose} storeId={storeId} />}
    </>
  );
}
