"use client";

import { useState, useMemo, useRef } from "react";
import { Icon } from "@iconify/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { generateCommission } from "./actions";
import type { CommissionRow, SimpleStore } from "./actions";
import type { ActionPermissions } from "@/lib/require-permission";

const STATUS_BADGES: Record<string, string> = {
  unpaid: "bg-warning bg-opacity-10 text-warning",
  partially_paid: "bg-info bg-opacity-10 text-info",
  paid: "bg-success bg-opacity-10 text-success",
};

export default function CommissionsClient({
  commissions,
  stores,
  storeId,
  actionPerms,
}: {
  commissions: CommissionRow[];
  stores: SimpleStore[];
  storeId: string | null;
  actionPerms?: ActionPermissions;
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [generateError, setGenerateError] = useState("");
  const formRef = useRef<HTMLFormElement>(null);

  const filtered = useMemo(() => {
    return commissions.filter((c) => {
      if (!search) return true;
      const q = search.toLowerCase();
      return (c.store_name?.toLowerCase() ?? "").includes(q);
    });
  }, [commissions, search]);

  return (
    <div>
      <div className="d-flex flex-wrap gap-2 align-items-center justify-content-between mb-3">
        <h5 className="mb-0">
          Commissions ({filtered.length})
          {actionPerms?.canCreate && (
            <button
              className="btn btn-sm btn-primary ms-3"
              onClick={() => { setShowGenerateModal(true); setGenerateError(""); }}
            >
              <Icon icon="mdi:plus" className="me-1" />
              Generate Commission
            </button>
          )}
        </h5>
        <input
          type="text"
          className="form-control form-control-sm"
          placeholder="Search by store..."
          style={{ width: 260 }}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="table-responsive">
        <table className="table table-hover align-middle mb-0">
          <thead className="table-light">
            <tr>
              <th>Store</th>
              <th>Period</th>
              <th className="text-end">Revenue</th>
              <th className="text-center">Rate</th>
              <th className="text-end">Commission</th>
              <th className="text-end">Balance Due</th>
              <th className="text-center">Status</th>
              <th className="text-center">Payments</th>
              <th className="text-center">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={9} className="text-center text-muted py-4">
                  No commissions found
                </td>
              </tr>
            ) : (
              filtered.map((c) => (
                <tr key={c.id}>
                  <td className="fw-medium">{c.store_name ?? "—"}</td>
                  <td style={{ fontSize: "0.85rem" }}>
                    {new Date(c.period_start).toLocaleDateString("en-IN")} - {new Date(c.period_end).toLocaleDateString("en-IN")}
                  </td>
                  <td className="text-end">₹{c.total_revenue.toLocaleString()}</td>
                  <td className="text-center">{c.commission_rate}%</td>
                  <td className="text-end">₹{c.commission_amount.toLocaleString()}</td>
                  <td className="text-end fw-semibold">₹{c.balance_due.toLocaleString()}</td>
                  <td className="text-center">
                    <span className={`badge ${STATUS_BADGES[c.status] ?? "bg-secondary"}`}>
                      {c.status.replace("_", " ").replace(/\b\w/g, (s) => s.toUpperCase())}
                    </span>
                  </td>
                  <td className="text-center">
                    <span className="badge bg-primary bg-opacity-10 text-primary">
                      {c.payment_count}
                    </span>
                  </td>
                  <td className="text-center">
                    <Link
                      href={`/commissions/${c.id}`}
                      className="btn btn-sm btn-outline-primary"
                      title="View Details"
                    >
                      <Icon icon="mdi:eye-outline" />
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showGenerateModal && (
        <div className="modal d-block" tabIndex={-1} style={{ backgroundColor: "rgba(0,0,0,0.5)" }}>
          <div className="modal-dialog">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Generate Commission</h5>
                <button type="button" className="btn-close" onClick={() => { setShowGenerateModal(false); setGenerateError(""); }} />
              </div>
              <form
                ref={formRef}
                action={async (fd) => {
                  try {
                    setGenerateError("");
                    await generateCommission(fd);
                    setShowGenerateModal(false);
                    router.refresh();
                  } catch (e: unknown) {
                    setGenerateError(e instanceof Error ? e.message : "Failed to generate commission");
                  }
                }}
              >
                <div className="modal-body">
                  {generateError && <div className="alert alert-danger py-2">{generateError}</div>}
                  {!storeId && (
                    <div className="mb-3">
                      <label className="form-label">Store <span className="text-danger">*</span></label>
                      <select name="store_id" className="form-select" required>
                        <option value="">Select store</option>
                        {stores.map((s) => (
                          <option key={s.id} value={s.id}>{s.name}</option>
                        ))}
                      </select>
                    </div>
                  )}
                  {storeId && (
                    <input type="hidden" name="store_id" value={storeId} />
                  )}
                  <div className="row mb-3">
                    <div className="col-6">
                      <label className="form-label">Period Start <span className="text-danger">*</span></label>
                      <input type="date" name="period_start" className="form-control" required />
                    </div>
                    <div className="col-6">
                      <label className="form-label">Period End <span className="text-danger">*</span></label>
                      <input type="date" name="period_end" className="form-control" required />
                    </div>
                  </div>
                  <div className="mb-3">
                    <label className="form-label">Notes</label>
                    <textarea name="notes" className="form-control" rows={2} placeholder="Optional notes..." />
                  </div>
                </div>
                <div className="modal-footer">
                  <button type="button" className="btn btn-secondary" onClick={() => { setShowGenerateModal(false); setGenerateError(""); }}>Cancel</button>
                  <button type="submit" className="btn btn-primary">Generate</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
