"use client";

import { useState, useEffect, useRef } from "react";
import { useActionState } from "react";
import { runServerAction } from "@/lib/run-server-action";
import {
  createDeliveryZone,
  updateDeliveryZone,
  getZoneWithBoundary,
} from "./actions";

type Zone = {
  id: string; name: string; store_id: string; pincodes: string[];
  radius_km: number; delivery_charge: number; free_delivery_min_order: number;
  is_active: boolean; is_express: boolean;
  boundary?: number[][] | null;
};

type ZoneMode = "polygon" | "radius";

export default function ZoneForm({ zone, onClose, storeId }: { zone: Zone | null; onClose: () => void; storeId?: string | null }) {
  const [boundary, setBoundary] = useState<number[][] | null>(null);
  const boundaryFetched = useRef(false);
  const hasBoundary = useRef(false);

  const [mode, setMode] = useState<ZoneMode>(() => {
    if (zone && zone.radius_km > 0 && !zone.boundary) return "radius";
    return "polygon";
  });

  useEffect(() => {
    if (zone?.id && !boundaryFetched.current) {
      boundaryFetched.current = true;
      getZoneWithBoundary(zone.id)
        .then((z) => {
          setBoundary(z.boundary);
          hasBoundary.current = z.boundary != null && z.boundary.length > 0;
          if (z.boundary && z.boundary.length > 0) setMode("polygon");
        })
        .catch(() => setBoundary(null));
    }
  }, [zone?.id]);

  const [state, formAction, pending] = useActionState(async (_prev: { error: string | null }, formData: FormData) => {
    const action = zone
      ? updateDeliveryZone.bind(null, zone.id)
      : createDeliveryZone;
    const result = await runServerAction(action, formData);
    if (result.ok) {
      onClose();
      return { error: null };
    }
    return { error: result.error.message };
  }, { error: null });

  return (
    <div style={{
      position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.5)", zIndex: 1050,
      display: "flex", alignItems: "center", justifyContent: "center",
    }} onClick={onClose}>
      <div className="card" style={{ width: 560, maxWidth: "90vw" }} onClick={(e) => e.stopPropagation()}>
        <div className="card-header d-flex justify-content-between align-items-center">
          <strong>{zone ? "Edit Zone" : "Add Zone"}</strong>
          <button type="button" className="btn-close" onClick={onClose} />
        </div>
        <form action={formAction}>
          <div className="card-body">
            {state.error && <div className="alert alert-danger py-2">{state.error}</div>}

            <div className="mb-3">
              <label className="form-label">Name <span className="text-danger">*</span></label>
              <input type="text" name="name" className="form-control" defaultValue={zone?.name ?? ""} required />
            </div>

            {(storeId != null) ? (
              <input type="hidden" name="store_id" value={storeId} />
            ) : (
              <div className="mb-3">
                <label className="form-label">Store ID <span className="text-danger">*</span></label>
                <input type="text" name="store_id" className="form-control" defaultValue={zone?.store_id ?? ""} required placeholder="UUID" />
              </div>
            )}

            <div className="mb-3">
              <label className="form-label">Pincodes <span className="text-muted small">(comma-separated)</span></label>
              <input type="text" name="pincodes" className="form-control" defaultValue={zone?.pincodes?.join(", ") ?? ""} placeholder="e.g. 110001, 110002, 110003" />
            </div>

            <div className="row mb-3">
              <div className="col-4">
                <label className="form-label">Delivery Charge</label>
                <input type="number" name="delivery_charge" className="form-control" defaultValue={zone?.delivery_charge ?? 0} min={0} step="0.01" />
              </div>
              <div className="col-4">
                <label className="form-label">Free Min Order</label>
                <input type="number" name="free_delivery_min_order" className="form-control" defaultValue={zone?.free_delivery_min_order ?? 0} min={0} step="0.01" />
              </div>
              <div className="col-4">
                <label className="form-label">Express</label>
                <div className="form-check form-switch" style={{ marginTop: 8 }}>
                  <input type="checkbox" name="is_express" className="form-check-input" id="zoneExpress" defaultChecked={zone?.is_express ?? false} />
                </div>
              </div>
            </div>

            <div className="mb-3">
              <label className="form-label">Coverage Type</label>
              <div className="d-flex gap-2 mt-1">
                <button type="button" className={`btn btn-sm ${mode === "radius" ? "btn-primary" : "btn-outline-secondary"}`} onClick={() => setMode("radius")}>
                  <i className="bi bi-circle me-1" />Radius (km)
                </button>
                <button type="button" className={`btn btn-sm ${mode === "polygon" ? "btn-primary" : "btn-outline-secondary"}`} onClick={() => { setMode("polygon"); setBoundary(boundary); }}>
                  <i className="bi bi-hexagon me-1" />Polygon
                </button>
              </div>
            </div>

            {mode === "radius" && (
              <div className="mb-3">
                <label className="form-label">Radius (km)</label>
                <input
                  type="number"
                  name="radius_km"
                  className="form-control"
                  defaultValue={zone?.radius_km ?? 0}
                  min={0}
                  step="0.1"
                  required
                />
                <div className="form-text">
                  Set the delivery radius from the store&apos;s location. Store must have lat/lng configured.
                  Create multiple zones with different radii and charges for tiered pricing.
                </div>
              </div>
            )}

            {mode === "radius" && (
              <input type="hidden" name="boundary" value="" />
            )}

            {mode === "polygon" && (
              <>
                <div className="mb-3">
                  <label className="form-label">
                    Boundary Polygon
                    <span className="text-muted small ms-1">(JSON: [[lat, lng], ...])</span>
                  </label>
                  <textarea
                    name="boundary"
                    className="form-control font-monospace"
                    rows={3}
                    defaultValue={boundary ? JSON.stringify(boundary) : ""}
                    placeholder="e.g. [[12.97, 77.59], [12.98, 77.60], [12.96, 77.61]]"
                    style={{ fontSize: "0.8rem" }}
                  />
                </div>
                <input type="hidden" name="radius_km" value="0" />
              </>
            )}

            <div className="d-flex gap-3">
              <div className="form-check">
                <input type="checkbox" name="is_active" className="form-check-input" id="zoneActive" defaultChecked={zone?.is_active ?? true} />
                <label className="form-check-label" htmlFor="zoneActive">Active</label>
              </div>
            </div>
          </div>
          <div className="card-footer d-flex gap-2 justify-content-end">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={pending}>
              {pending ? "Saving..." : zone ? "Update Zone" : "Create Zone"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
