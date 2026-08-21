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
  min_order_value: number | null; max_order_value: number | null;
  min_distance_km: number | null; max_distance_km: number | null;
  is_active: boolean; is_express: boolean;
  boundary?: number[][] | null;
};

type ZoneMode = "polygon" | "radius";

function Section({ title, icon, children, defaultOpen = true }: {
  title: string; icon: string; children: React.ReactNode; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="mb-3">
      <button type="button" className="btn btn-sm w-100 text-start d-flex align-items-center justify-content-between px-0 py-1"
        onClick={() => setOpen(!open)} style={{ background: "none", border: "none", color: "inherit" }}>
        <span className="fw-semibold"><i className={`bi ${icon} me-2`} />{title}</span>
        <i className={`bi bi-chevron-${open ? "up" : "down"} text-muted`} />
      </button>
      {open && <div className="pt-2">{children}</div>}
    </div>
  );
}

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

  const hasConditions = (zone?.min_order_value != null && zone.min_order_value !== 0) ||
    (zone?.max_order_value != null) || (zone?.min_distance_km != null && zone.min_distance_km !== 0) || (zone?.max_distance_km != null);

  return (
    <div style={{
      position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.5)", zIndex: 1050,
      display: "flex", alignItems: "center", justifyContent: "center",
    }} onClick={onClose}>
      <div className="card shadow-lg" style={{ width: 520, maxWidth: "92vw", maxHeight: "90vh", overflow: "auto" }} onClick={(e) => e.stopPropagation()}>
        <div className="card-header d-flex justify-content-between align-items-center py-3">
          <h6 className="mb-0 fw-bold"><i className="bi bi-geo-alt me-2" />{zone ? "Edit Zone" : "New Zone"}</h6>
          <button type="button" className="btn-close" onClick={onClose} />
        </div>
        <form action={formAction}>
          <div className="card-body px-4 py-3">
            {state.error && <div className="alert alert-danger py-2 mb-3"><i className="bi bi-exclamation-triangle me-1" />{state.error}</div>}

            {(storeId != null) ? (
              <input type="hidden" name="store_id" value={storeId} />
            ) : (
              <div className="mb-3">
                <label className="form-label small text-muted">Store ID <span className="text-danger">*</span></label>
                <input type="text" name="store_id" className="form-control form-control-sm" defaultValue={zone?.store_id ?? ""} required placeholder="UUID" />
              </div>
            )}

            <div className="mb-3">
              <label className="form-label small text-muted">Zone Name <span className="text-danger">*</span></label>
              <input type="text" name="name" className="form-control form-control-sm" defaultValue={zone?.name ?? ""} required placeholder="e.g. Near Store, 0-3km Free" />
            </div>

            <div className="mb-3">
              <label className="form-label small text-muted">Pincodes</label>
              <input type="text" name="pincodes" className="form-control form-control-sm" defaultValue={zone?.pincodes?.join(", ") ?? ""} placeholder="110001, 110002, 110003" />
            </div>

            <Section title="Pricing" icon="bi-credit-card">
              <div className="row g-2">
                <div className="col-6">
                  <label className="form-label small text-muted">Delivery Charge</label>
                  <div className="input-group input-group-sm">
                    <span className="input-group-text">₹</span>
                    <input type="number" name="delivery_charge" className="form-control" defaultValue={zone?.delivery_charge ?? 0} min={0} step="0.01" />
                  </div>
                </div>
                <div className="col-6">
                  <label className="form-label small text-muted">Free Above</label>
                  <div className="input-group input-group-sm">
                    <span className="input-group-text">₹</span>
                    <input type="number" name="free_delivery_min_order" className="form-control" defaultValue={zone?.free_delivery_min_order ?? 0} min={0} step="0.01" />
                  </div>
                </div>
              </div>
            </Section>

            <Section title="Coverage" icon="bi-map">
              <div className="d-flex gap-2 mb-2">
                <button type="button" className={`btn btn-sm flex-fill ${mode === "radius" ? "btn-primary" : "btn-outline-secondary"}`} onClick={() => setMode("radius")}>
                  <i className="bi bi-circle me-1" />Radius
                </button>
                <button type="button" className={`btn btn-sm flex-fill ${mode === "polygon" ? "btn-primary" : "btn-outline-secondary"}`} onClick={() => { setMode("polygon"); setBoundary(boundary); }}>
                  <i className="bi bi-hexagon me-1" />Polygon
                </button>
              </div>

              {mode === "radius" && (
                <>
                  <div className="input-group input-group-sm mb-1">
                    <input type="number" name="radius_km" className="form-control" defaultValue={zone?.radius_km ?? 0} min={0} step="0.1" required placeholder="5" />
                    <span className="input-group-text">km</span>
                  </div>
                  <input type="hidden" name="boundary" value="" />
                  <div className="form-text">Radius from store location. Store needs lat/lng configured.</div>
                </>
              )}

              {mode === "polygon" && (
                <>
                  <textarea
                    name="boundary"
                    className="form-control form-control-sm font-monospace"
                    rows={2}
                    defaultValue={boundary ? JSON.stringify(boundary) : ""}
                    placeholder="[[12.97, 77.59], [12.98, 77.60], ...]"
                    style={{ fontSize: "0.75rem" }}
                  />
                  <input type="hidden" name="radius_km" value="0" />
                </>
              )}
            </Section>

            <Section title="Conditions" icon="bi-funnel" defaultOpen={hasConditions}>
              <p className="text-muted small mb-2">Restrict this zone to specific order values or distances. Leave blank to apply to all.</p>
              <div className="row g-2 mb-2">
                <div className="col-6">
                  <label className="form-label small text-muted">Min Order</label>
                  <div className="input-group input-group-sm">
                    <span className="input-group-text">₹</span>
                    <input type="number" name="min_order_value" className="form-control" defaultValue={zone?.min_order_value ?? ""} min={0} step="0.01" placeholder="No min" />
                  </div>
                </div>
                <div className="col-6">
                  <label className="form-label small text-muted">Max Order</label>
                  <div className="input-group input-group-sm">
                    <span className="input-group-text">₹</span>
                    <input type="number" name="max_order_value" className="form-control" defaultValue={zone?.max_order_value ?? ""} min={0} step="0.01" placeholder="No max" />
                  </div>
                </div>
              </div>
              <div className="row g-2">
                <div className="col-6">
                  <label className="form-label small text-muted">Min Distance</label>
                  <div className="input-group input-group-sm">
                    <input type="number" name="min_distance_km" className="form-control" defaultValue={zone?.min_distance_km ?? ""} min={0} step="0.1" placeholder="No min" />
                    <span className="input-group-text">km</span>
                  </div>
                </div>
                <div className="col-6">
                  <label className="form-label small text-muted">Max Distance</label>
                  <div className="input-group input-group-sm">
                    <input type="number" name="max_distance_km" className="form-control" defaultValue={zone?.max_distance_km ?? ""} min={0} step="0.1" placeholder="No max" />
                    <span className="input-group-text">km</span>
                  </div>
                </div>
              </div>
            </Section>
          </div>
          <div className="card-footer d-flex align-items-center justify-content-between py-3 px-4">
            <div className="d-flex gap-3">
              <div className="form-check form-switch">
                <input type="checkbox" name="is_active" className="form-check-input" id="zoneActive" defaultChecked={zone?.is_active ?? true} />
                <label className="form-check-label small" htmlFor="zoneActive">Active</label>
              </div>
              <div className="form-check form-switch">
                <input type="checkbox" name="is_express" className="form-check-input" id="zoneExpress" defaultChecked={zone?.is_express ?? false} />
                <label className="form-check-label small" htmlFor="zoneExpress">Express</label>
              </div>
            </div>
            <div className="d-flex gap-2">
              <button type="button" className="btn btn-sm btn-outline-secondary" onClick={onClose}>Cancel</button>
              <button type="submit" className="btn btn-sm btn-primary px-3" disabled={pending}>
                {pending ? <><span className="spinner-border spinner-border-sm me-1" />Saving...</> : zone ? "Update" : "Create"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
