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

function formatConditions(zone: Zone) {
  const parts: string[] = [];
  if (zone.min_order_value != null && zone.min_order_value > 0) parts.push(`Min ₹${zone.min_order_value}`);
  if (zone.max_order_value != null) parts.push(`Max ₹${zone.max_order_value}`);
  if (zone.min_distance_km != null && zone.min_distance_km > 0) parts.push(`Min ${zone.min_distance_km}km`);
  if (zone.max_distance_km != null) parts.push(`Max ${zone.max_distance_km}km`);
  return parts;
}

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
              <th>Charge</th>
              <th>Conditions</th>
              <th>Status</th>
              <th className="text-center">Actions</th>
            </tr>
          </thead>
          <tbody>
            {zones.length === 0 && (
              <tr>
                <td colSpan={6} className="text-center text-muted py-4">No delivery zones yet</td>
              </tr>
            )}
            {zones.map((zone) => {
              const conditions = formatConditions(zone);
              return (
                <tr key={zone.id}>
                  <td className="fw-semibold">{zone.name}</td>
                  <td style={{ maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {zone.pincodes?.length ? zone.pincodes.join(", ") : "\u2014"}
                  </td>
                  <td>
                    {Number(zone.delivery_charge) === 0 ? (
                      <span className="text-success fw-semibold">Free</span>
                    ) : (
                      `₹${Number(zone.delivery_charge).toFixed(0)}`
                    )}
                    {zone.free_delivery_min_order != null && Number(zone.free_delivery_min_order) > 0 && (
                      <div className="text-muted small">Free above ₹{Number(zone.free_delivery_min_order).toFixed(0)}</div>
                    )}
                  </td>
                  <td>
                    {conditions.length === 0 ? (
                      <span className="text-muted small">All orders</span>
                    ) : (
                      <div className="d-flex flex-wrap gap-1">
                        {conditions.map((c, i) => (
                          <span key={i} className="badge bg-light text-dark border">{c}</span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td>
                    <div className="d-flex gap-1">
                      <span className={`badge ${zone.is_active ? "bg-success" : "bg-secondary"}`}>
                        {zone.is_active ? "Active" : "Off"}
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
              );
            })}
          </tbody>
        </table>
      </div>

      {showForm && <ZoneForm zone={editing} onClose={handleFormClose} storeId={storeId} />}
    </>
  );
}
