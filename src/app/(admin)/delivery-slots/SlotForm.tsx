"use client";

import { useActionState } from "react";
import { createDeliverySlot, updateDeliverySlot } from "./actions";

type Slot = {
  id: string; name: string; zone_id: string; start_time: string; end_time: string;
  available_days: number[]; capacity: number; is_active: boolean;
};

export default function SlotForm({ slot, onClose }: { slot: Slot | null; onClose: () => void }) {
  const [state, formAction, pending] = useActionState(async (_prev: { error: string | null }, formData: FormData) => {
    try {
      if (slot) {
        await updateDeliverySlot(slot.id, formData);
      } else {
        await createDeliverySlot(formData);
      }
      onClose();
      return { error: null };
    } catch (e) {
      return { error: e instanceof Error ? e.message : "An error occurred" };
    }
  }, { error: null });

  return (
    <div style={{
      position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.5)", zIndex: 1050,
      display: "flex", alignItems: "center", justifyContent: "center",
    }} onClick={onClose}>
      <div className="card" style={{ width: 500, maxWidth: "90vw" }} onClick={(e) => e.stopPropagation()}>
        <div className="card-header d-flex justify-content-between align-items-center">
          <strong>{slot ? "Edit Slot" : "Add Slot"}</strong>
          <button type="button" className="btn-close" onClick={onClose} />
        </div>
        <form action={formAction}>
          <div className="card-body">
            {state.error && <div className="alert alert-danger py-2">{state.error}</div>}

            <div className="mb-3">
              <label className="form-label">Name <span className="text-danger">*</span></label>
              <input type="text" name="name" className="form-control" defaultValue={slot?.name ?? ""} required />
            </div>

            <div className="mb-3">
              <label className="form-label">Zone ID <span className="text-danger">*</span></label>
              <input type="text" name="zone_id" className="form-control" defaultValue={slot?.zone_id ?? ""} required placeholder="UUID" />
            </div>

            <div className="row mb-3">
              <div className="col-6">
                <label className="form-label">Start Time <span className="text-danger">*</span></label>
                <input type="time" name="start_time" className="form-control" defaultValue={slot?.start_time ?? ""} required />
              </div>
              <div className="col-6">
                <label className="form-label">End Time <span className="text-danger">*</span></label>
                <input type="time" name="end_time" className="form-control" defaultValue={slot?.end_time ?? ""} required />
              </div>
            </div>

            <div className="mb-3">
              <label className="form-label">Available Days <span className="text-muted small">(comma-separated numbers: 0=Sun, 1=Mon, ..., 6=Sat)</span></label>
              <input type="text" name="available_days" className="form-control" defaultValue={slot?.available_days?.join(",") ?? ""} placeholder="e.g. 1,2,3,4,5" />
            </div>

            <div className="row mb-3">
              <div className="col-6">
                <label className="form-label">Capacity</label>
                <input type="number" name="capacity" className="form-control" defaultValue={slot?.capacity ?? 0} min={0} />
              </div>
              <div className="col-6 d-flex align-items-end">
                <div className="form-check">
                  <input type="checkbox" name="is_active" className="form-check-input" id="slotActive" defaultChecked={slot?.is_active ?? true} />
                  <label className="form-check-label" htmlFor="slotActive">Active</label>
                </div>
              </div>
            </div>
          </div>
          <div className="card-footer d-flex gap-2 justify-content-end">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={pending}>
              {pending ? "Saving..." : slot ? "Update Slot" : "Create Slot"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
