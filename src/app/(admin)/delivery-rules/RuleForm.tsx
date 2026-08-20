"use client";

import { useState } from "react";
import { useActionState } from "react";
import { runServerAction } from "@/lib/run-server-action";
import { createDeliveryRule, updateDeliveryRule } from "./actions";

type Rule = {
  id: string;
  name: string;
  store_id: string;
  min_order_value: number | null;
  max_order_value: number | null;
  min_distance_km: number | null;
  max_distance_km: number | null;
  charge: number;
  priority: number;
  is_active: boolean;
};

export default function RuleForm({ rule, onClose, storeId }: { rule: Rule | null; onClose: () => void; storeId?: string | null }) {
  const [state, formAction, pending] = useActionState(async (_prev: { error: string | null }, formData: FormData) => {
    const action = rule
      ? updateDeliveryRule.bind(null, rule.id)
      : createDeliveryRule;
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
          <strong>{rule ? "Edit Rule" : "Add Rule"}</strong>
          <button type="button" className="btn-close" onClick={onClose} />
        </div>
        <form action={formAction}>
          <div className="card-body">
            {state.error && <div className="alert alert-danger py-2">{state.error}</div>}

            <div className="mb-3">
              <label className="form-label">Rule Name <span className="text-danger">*</span></label>
              <input type="text" name="name" className="form-control" defaultValue={rule?.name ?? ""} required placeholder="e.g. Near Store Free Delivery" />
            </div>

            {(storeId != null) ? (
              <input type="hidden" name="store_id" value={storeId} />
            ) : (
              <div className="mb-3">
                <label className="form-label">Store ID <span className="text-danger">*</span></label>
                <input type="text" name="store_id" className="form-control" defaultValue={rule?.store_id ?? ""} required placeholder="UUID" />
              </div>
            )}

            <div className="row mb-3">
              <div className="col-6">
                <label className="form-label">Charge (₹) <span className="text-danger">*</span></label>
                <input type="number" name="charge" className="form-control" defaultValue={rule?.charge ?? 0} min={0} step="0.01" required />
              </div>
              <div className="col-6">
                <label className="form-label">Priority</label>
                <input type="number" name="priority" className="form-control" defaultValue={rule?.priority ?? 0} min={0} step={1} />
                <div className="form-text">Lower = evaluated first. First matching rule wins.</div>
              </div>
            </div>

            <hr />
            <p className="small fw-bold text-muted mb-2">Order Value Conditions <span className="fw-normal">(leave blank for &quot;any&quot;)</span></p>
            <div className="row mb-3">
              <div className="col-6">
                <label className="form-label">Min Order Value (₹)</label>
                <input type="number" name="min_order_value" className="form-control" defaultValue={rule?.min_order_value ?? ""} min={0} step="1" placeholder="e.g. 500" />
              </div>
              <div className="col-6">
                <label className="form-label">Max Order Value (₹)</label>
                <input type="number" name="max_order_value" className="form-control" defaultValue={rule?.max_order_value ?? ""} min={0} step="1" placeholder="e.g. 3000" />
              </div>
            </div>

            <p className="small fw-bold text-muted mb-2">Distance Conditions <span className="fw-normal">(leave blank for &quot;any&quot;)</span></p>
            <div className="row mb-3">
              <div className="col-6">
                <label className="form-label">Min Distance (km)</label>
                <input type="number" name="min_distance_km" className="form-control" defaultValue={rule?.min_distance_km ?? ""} min={0} step="0.1" placeholder="e.g. 0" />
              </div>
              <div className="col-6">
                <label className="form-label">Max Distance (km)</label>
                <input type="number" name="max_distance_km" className="form-control" defaultValue={rule?.max_distance_km ?? ""} min={0} step="0.1" placeholder="e.g. 3" />
              </div>
            </div>

            <div className="d-flex gap-3">
              <div className="form-check">
                <input type="checkbox" name="is_active" className="form-check-input" id="ruleActive" defaultChecked={rule?.is_active ?? true} />
                <label className="form-check-label" htmlFor="ruleActive">Active</label>
              </div>
            </div>
          </div>
          <div className="card-footer d-flex gap-2 justify-content-end">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={pending}>
              {pending ? "Saving..." : rule ? "Update Rule" : "Create Rule"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
