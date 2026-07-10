"use client";

import { useState, useEffect, useActionState } from "react";
import { runServerAction } from "@/lib/run-server-action";
import { createGstNumber, updateGstNumber, getStoresForGstAttach } from "./actions";

type StoreOption = { id: string; name: string; code: string };

type GstNumber = {
  id: string; store_id: string; gstin: string; legal_name: string; business_address: string;
  state_code: string; is_primary: boolean; is_active: boolean; current_turnover: number;
  financial_year: string; threshold_amount: number; stores?: { name: string } | null;
};

export default function GstForm({ gstNumber, onClose }: { gstNumber: GstNumber | null; onClose: () => void }) {
  const [stores, setStores] = useState<StoreOption[]>([]);

  useEffect(() => {
    getStoresForGstAttach().then(setStores).catch(() => {});
  }, []);
  const [state, formAction, pending] = useActionState(async (_prev: { error: string | null }, formData: FormData) => {
    const action = gstNumber
      ? updateGstNumber.bind(null, gstNumber.id)
      : createGstNumber;
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
      <div className="card" style={{ width: 540, maxWidth: "90vw" }} onClick={(e) => e.stopPropagation()}>
        <div className="card-header d-flex justify-content-between align-items-center">
          <strong>{gstNumber ? "Edit GST Number" : "Add GST Number"}</strong>
          <button type="button" className="btn-close" onClick={onClose} />
        </div>
        <form action={formAction}>
          <div className="card-body">
            {state.error && <div className="alert alert-danger py-2">{state.error}</div>}

            <div className="mb-3">
              <label className="form-label">Store <span className="text-danger">*</span></label>
              <select name="store_id" className="form-select" defaultValue={gstNumber?.store_id ?? ""} required>
                <option value="">-- Select a store --</option>
                {stores.map((s) => (
                  <option key={s.id} value={s.id}>{s.name} ({s.code})</option>
                ))}
              </select>
            </div>

            <div className="mb-3">
              <label className="form-label">GSTIN <span className="text-danger">*</span></label>
              <input type="text" name="gstin" className="form-control" defaultValue={gstNumber?.gstin ?? ""} required placeholder="e.g. 29ABCDE1234F1Z5" />
            </div>

            <div className="mb-3">
              <label className="form-label">Legal Name <span className="text-danger">*</span></label>
              <input type="text" name="legal_name" className="form-control" defaultValue={gstNumber?.legal_name ?? ""} required />
            </div>

            <div className="mb-3">
              <label className="form-label">Business Address</label>
              <textarea name="business_address" className="form-control" rows={2} defaultValue={gstNumber?.business_address ?? ""} />
            </div>

            <div className="row mb-3">
              <div className="col-4">
                <label className="form-label">State Code</label>
                <input type="text" name="state_code" className="form-control" defaultValue={gstNumber?.state_code ?? ""} placeholder="e.g. 29" />
              </div>
              <div className="col-4">
                <label className="form-label">Financial Year</label>
                <input type="text" name="financial_year" className="form-control" defaultValue={gstNumber?.financial_year ?? ""} placeholder="e.g. 2025-26" />
              </div>
              <div className="col-4">
                <label className="form-label">Threshold Amount</label>
                <input type="number" name="threshold_amount" className="form-control" defaultValue={gstNumber?.threshold_amount ?? 0} min={0} step="0.01" />
              </div>
            </div>

            <div className="row mb-3">
              <div className="col-6">
                <label className="form-label">Current Turnover</label>
                <input type="number" name="current_turnover" className="form-control" defaultValue={gstNumber?.current_turnover ?? 0} min={0} step="0.01" />
              </div>
              <div className="col-3 d-flex align-items-end">
                <div className="form-check">
                  <input type="checkbox" name="is_primary" className="form-check-input" id="gstPrimary" defaultChecked={gstNumber?.is_primary ?? false} />
                  <label className="form-check-label" htmlFor="gstPrimary">Primary</label>
                </div>
              </div>
              <div className="col-3 d-flex align-items-end">
                <div className="form-check">
                  <input type="checkbox" name="is_active" className="form-check-input" id="gstActive" defaultChecked={gstNumber?.is_active ?? true} />
                  <label className="form-check-label" htmlFor="gstActive">Active</label>
                </div>
              </div>
            </div>
          </div>
          <div className="card-footer d-flex gap-2 justify-content-end">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={pending}>
              {pending ? "Saving..." : gstNumber ? "Update GST Number" : "Create GST Number"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
