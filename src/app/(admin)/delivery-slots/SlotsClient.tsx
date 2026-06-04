"use client";

import { useState, useCallback } from "react";
import { Icon } from "@iconify/react";
import { toast } from "react-toastify";
import { deleteDeliverySlot, type getDeliverySlots } from "./actions";
import SlotForm from "./SlotForm";

type Slot = Awaited<ReturnType<typeof getDeliverySlots>>[number];

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function formatDays(days: number[]): string {
  if (!days || days.length === 0) return "\u2014";
  return days.map((d) => DAY_NAMES[d] ?? d).join(", ");
}

type ActionPermissions = {
  canView: boolean; canCreate: boolean; canEdit: boolean; canDelete: boolean;
};

export default function SlotsClient({ slots: initial, actionPerms }: { slots: Slot[]; actionPerms?: ActionPermissions }) {
  const [slots, setSlots] = useState(initial);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Slot | null>(null);

  const handleDelete = useCallback(async (id: string, name: string) => {
    if (!confirm(`Delete slot "${name}"?`)) return;
    try {
      await deleteDeliverySlot(id);
      setSlots((prev) => prev.filter((s) => s.id !== id));
      toast.success("Slot deleted");
    } catch {
      toast.error("Failed to delete slot");
    }
  }, []);

  const handleEdit = useCallback((slot: Slot) => {
    setEditing(slot);
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
        <h5 className="mb-0">All Delivery Slots ({slots.length})</h5>
        {actionPerms?.canCreate && (
          <button className="btn btn-primary btn-sm" onClick={handleNew}>
            <Icon icon="ri:add-line" width={16} className="me-1" />Add Slot
          </button>
        )}
      </div>
      <div className="table-responsive">
        <table className="table table-hover align-middle mb-0">
          <thead className="table-light">
            <tr>
              <th>Name</th>
              <th>Zone ID</th>
              <th>Start Time</th>
              <th>End Time</th>
              <th>Days</th>
              <th>Capacity</th>
              <th>Status</th>
              <th className="text-center">Actions</th>
            </tr>
          </thead>
          <tbody>
            {slots.length === 0 && (
              <tr>
                <td colSpan={8} className="text-center text-muted py-4">No delivery slots yet</td>
              </tr>
            )}
            {slots.map((slot) => (
              <tr key={slot.id}>
                <td className="fw-semibold">{slot.name}</td>
                <td><code className="small">{slot.zone_id}</code></td>
                <td>{slot.start_time}</td>
                <td>{slot.end_time}</td>
                <td>{formatDays(slot.available_days)}</td>
                <td>{slot.capacity}</td>
                <td>
                  <span className={`badge ${slot.is_active ? "bg-success" : "bg-secondary"}`}>
                    {slot.is_active ? "Active" : "Inactive"}
                  </span>
                </td>
                <td className="text-center">
                  <div className="d-flex gap-1 justify-content-center">
                    {actionPerms?.canEdit && (
                      <button className="btn btn-sm btn-outline-primary" title="Edit" onClick={() => handleEdit(slot)}>
                        <Icon icon="ri:pencil-line" width={16} />
                      </button>
                    )}
                    {actionPerms?.canDelete && (
                      <button className="btn btn-sm btn-outline-danger" title="Delete" onClick={() => handleDelete(slot.id, slot.name)}>
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

      {showForm && <SlotForm slot={editing} onClose={handleFormClose} />}
    </>
  );
}
