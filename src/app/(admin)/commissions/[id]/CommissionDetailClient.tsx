"use client";

import { useState, useRef } from "react";
import { Icon } from "@iconify/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "react-toastify";
import { runServerAction } from "@/lib/run-server-action";
import { recordPayment, deleteCommissionPayment } from "../actions";
import type { CommissionRow, CommissionPayment } from "../actions";
import type { ActionPermissions } from "@/lib/require-permission";

const STATUS_BADGES: Record<string, string> = {
  unpaid: "bg-warning bg-opacity-10 text-warning",
  partially_paid: "bg-info bg-opacity-10 text-info",
  paid: "bg-success bg-opacity-10 text-success",
};

export default function CommissionDetailClient({
  commission,
  payments,
  actionPerms,
}: {
  commission: CommissionRow;
  payments: CommissionPayment[];
  actionPerms: ActionPermissions;
}) {
  const router = useRouter();
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<CommissionPayment | null>(null);
  const [savingPayment, setSavingPayment] = useState(false);
  const [deletingPayment, setDeletingPayment] = useState(false);
  const [error, setError] = useState("");
  const paymentFormRef = useRef<HTMLFormElement>(null);

  // P46: derived values for the summary row. We don't store `paid_amount`
  // in the schema (per the column inventory in 20260613000002_add_commissions.sql)
  // so it's computed at read time as commission_amount - balance_due. Negative
  // values are clamped to 0 (would only happen if balance_due is set to a
  // negative value out-of-band).
  const remainingBalance = commission.balance_due;
  const totalCommission = commission.commission_amount;
  const paidAmount = Math.max(totalCommission - remainingBalance, 0);

  return (
    <div>
      <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-4">
        <div className="d-flex align-items-center gap-2">
          <Link href="/commissions" className="btn btn-sm btn-outline-secondary">
            <Icon icon="mdi:arrow-left" />
          </Link>
          <h5 className="mb-0">Commission Detail</h5>
        </div>
        {actionPerms.canEdit && (
          <button
            type="button"
            className="btn btn-sm btn-success"
            onClick={() => { setShowPaymentModal(true); setError(""); }}
            data-testid="commission-record-payment-btn"
          >
            <Icon icon="mdi:plus" className="me-1" />
            {remainingBalance > 0 ? "Record Payment" : "Record Payment / Credit"}
          </button>
        )}
      </div>

      <div className="card shadow-sm mb-4">
        <div className="card-body">
          <div className="row g-3">
            <div className="col-md-3">
              <small className="text-muted d-block">Store</small>
              <span className="fw-medium">{commission.store_name ?? "—"}</span>
            </div>
            <div className="col-md-3">
              <small className="text-muted d-block">Period</small>
              <span>{new Date(commission.period_start).toLocaleDateString("en-IN")} - {new Date(commission.period_end).toLocaleDateString("en-IN")}</span>
            </div>
            <div className="col-md-2">
              <small className="text-muted d-block">Total Revenue</small>
              <span className="fw-medium">₹{commission.total_revenue.toLocaleString()}</span>
            </div>
            <div className="col-md-2">
              <small className="text-muted d-block">Rate</small>
              <span>{commission.commission_rate}%</span>
            </div>
            <div className="col-md-2">
              <small className="text-muted d-block">Commission Amount</small>
              <span className="fw-medium">₹{commission.commission_amount.toLocaleString()}</span>
            </div>
            <div className="col-md-3">
              <small className="text-muted d-block">Balance Due</small>
              <span
                className={`fw-semibold ${remainingBalance > 0 ? "text-danger" : "text-success"}`}
                data-testid="commission-balance-due"
              >
                ₹{remainingBalance.toLocaleString()}
              </span>
            </div>
            <div className="col-md-2">
              <small className="text-muted d-block">Status</small>
              <span className={`badge ${STATUS_BADGES[commission.status] ?? "bg-secondary"}`}>
                {commission.status.replace("_", " ").replace(/\b\w/g, (s) => s.toUpperCase())}
              </span>
            </div>
          </div>
          {commission.notes && (
            <div className="mt-3">
              <small className="text-muted d-block">Notes</small>
              <p className="mb-0">{commission.notes}</p>
            </div>
          )}
        </div>
      </div>

      {/* P46: summary row — makes the page useful at a glance */}
      <div
        className="card border-0 bg-light mb-3"
        data-testid="commission-summary-row"
      >
        <div className="card-body py-2">
          <div className="d-flex flex-wrap gap-3 align-items-center small">
            <span>
              <span className="text-muted">Total:</span>{" "}
              <strong>₹{totalCommission.toLocaleString()}</strong>
            </span>
            <span className="text-muted">·</span>
            <span>
              <span className="text-muted">Paid:</span>{" "}
              <strong className="text-success">₹{paidAmount.toLocaleString()}</strong>
            </span>
            <span className="text-muted">·</span>
            <span>
              <span className="text-muted">Balance:</span>{" "}
              <strong className={remainingBalance > 0 ? "text-danger" : "text-success"}>
                ₹{remainingBalance.toLocaleString()}
              </strong>
            </span>
          </div>
        </div>
      </div>

      <div className="d-flex flex-wrap gap-2 align-items-center justify-content-between mb-3">
        <h6 className="mb-0">Payment History ({payments.length})</h6>
      </div>

      <div className="table-responsive">
        <table className="table table-hover align-middle mb-0">
          <thead className="table-light">
            <tr>
              <th>#</th>
              <th>Amount</th>
              <th>Notes</th>
              <th>Recorded By</th>
              <th>Date</th>
              {actionPerms.canDelete && <th className="text-center">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {payments.length === 0 ? (
              <tr>
                <td colSpan={actionPerms.canDelete ? 6 : 5} className="text-center text-muted py-4">
                  No payments recorded yet
                </td>
              </tr>
            ) : (
              payments.map((p, i) => (
                <tr key={p.id}>
                  <td>{payments.length - i}</td>
                  <td className="fw-medium text-success">₹{p.amount.toLocaleString()}</td>
                  <td>{p.notes ?? "—"}</td>
                  <td>{p.created_by_name ?? "—"}</td>
                  <td>{new Date(p.created_at).toLocaleString("en-IN")}</td>
                  {actionPerms.canDelete && (
                    <td className="text-center">
                      <button
                        className="btn btn-sm btn-outline-danger"
                        title="Delete Payment"
                        onClick={() => { setDeleteTarget(p); setShowDeleteModal(true); }}
                        data-testid={`commission-payment-delete-${p.id}`}
                      >
                        <Icon icon="mdi:delete-outline" />
                      </button>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showPaymentModal && (
        <div className="modal d-block" tabIndex={-1} style={{ backgroundColor: "rgba(0,0,0,0.5)" }}>
          <div className="modal-dialog">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">
                  {remainingBalance > 0 ? "Record Payment" : "Record Payment / Credit"}
                </h5>
                <button type="button" className="btn-close" onClick={() => setShowPaymentModal(false)} />
              </div>
              <form
                ref={paymentFormRef}
                action={async (fd) => {
                  setError("");
                  setSavingPayment(true);
                  // runServerAction catches the throw and returns {ok:false, error}
                  // so the form handler doesn't have to wrap in try/catch.
                  const result = await runServerAction(recordPayment, fd);
                  setSavingPayment(false);
                  if (result.ok) {
                    toast.success("Payment recorded");
                    setShowPaymentModal(false);
                    router.refresh();
                  } else {
                    setError(result.error.message);
                    toast.error(result.error.message);
                  }
                }}
              >
                <div className="modal-body">
                  {error && <div className="alert alert-danger py-2">{error}</div>}
                  <input type="hidden" name="commission_id" value={commission.id} />
                  <div className="mb-3">
                    <label className="form-label">Amount (₹) <span className="text-danger">*</span></label>
                    <input
                      type="number"
                      name="amount"
                      className="form-control"
                      step="0.01"
                      min="0.01"
                      required
                      data-testid="commission-payment-amount-input"
                    />
                    <small className="text-muted">
                      Balance due: ₹{remainingBalance.toLocaleString()}
                      {remainingBalance === 0 && " (recording a credit / adjustment will push the balance negative)"}
                    </small>
                  </div>
                  <div className="mb-3">
                    <label className="form-label">Notes</label>
                    <textarea name="notes" className="form-control" rows={2} placeholder="Payment reference etc..." />
                  </div>
                </div>
                <div className="modal-footer">
                  <button type="button" className="btn btn-secondary" onClick={() => setShowPaymentModal(false)} disabled={savingPayment}>
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-success" disabled={savingPayment} data-testid="commission-payment-submit">
                    {savingPayment ? "Saving…" : "Record Payment"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {showDeleteModal && deleteTarget && (
        <div className="modal d-block" tabIndex={-1} style={{ backgroundColor: "rgba(0,0,0,0.5)" }}>
          <div className="modal-dialog modal-sm">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Delete Payment</h5>
                <button type="button" className="btn-close" onClick={() => { setShowDeleteModal(false); setDeleteTarget(null); }} />
              </div>
              <form
                action={async (fd) => {
                  setDeletingPayment(true);
                  const result = await runServerAction(deleteCommissionPayment, fd);
                  setDeletingPayment(false);
                  if (result.ok) {
                    toast.success("Payment deleted");
                    setShowDeleteModal(false);
                    setDeleteTarget(null);
                    router.refresh();
                  } else {
                    toast.error(result.error.message);
                  }
                }}
              >
                <div className="modal-body">
                  <p className="mb-0">Are you sure you want to delete this payment of <strong>₹{deleteTarget.amount.toLocaleString()}</strong>?</p>
                  <input type="hidden" name="payment_id" value={deleteTarget.id} />
                  <input type="hidden" name="commission_id" value={commission.id} />
                </div>
                <div className="modal-footer">
                  <button type="button" className="btn btn-secondary" onClick={() => { setShowDeleteModal(false); setDeleteTarget(null); }} disabled={deletingPayment}>
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-danger" disabled={deletingPayment} data-testid="commission-payment-delete-confirm">
                    {deletingPayment ? "Deleting…" : "Delete"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
