"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@iconify/react";
import { toast } from "react-toastify";
import {
  updateOrderStatus,
  updatePaymentStatus,
  generateInvoiceForOrder,
  type OrderStatus,
  type PaymentStatus,
} from "../actions";

/**
 * P54: Reusable status + payment controls. Originally inlined in
 * OrderDetailClient (src/app/(admin)/orders/[id]/OrderDetailClient.tsx);
 * extracted so it can be embedded anywhere a single order needs
 * edit affordances — primarily the new /cart/[cart_id] page where
 * each sub-order card needs full inline editing.
 *
 * Behavior:
 *   - Update Status button hidden when the order is already
 *     terminal (cancelled / returned / delivered) — keeps the
 *     action surface focused.
 *   - Update Payment button always shown (you can re-mark a paid
 *     order as refunded, etc.).
 *   - Status modal restricts options to forward-only flow + the
 *     explicit Cancel/Return escape hatches, with notes for
 *     forensic context (P50 logs cancelled/returned transitions).
 *   - P44 toast on delivered (invoice auto-generated).
 *   - P57: if the auto-invoice FAILED (caller lacks
 *     `invoices:create`, or the order has a NULL store_id, or
 *     any other DB error), the action returns the error message
 *     in `invoiceError` and we surface it as a warning toast.
 *     The status update itself still succeeds (per the original
 *     P44 design).
 *   - P57: when the order is delivered but has no invoice_id,
 *     a [Generate Invoice] button appears for callers with
 *     `invoices:create` — the manual retry path. For Staff
 *     (no invoices:create), only the warning toast is shown.
 *   - Both actions call router.refresh() so the surrounding
 *     page picks up the new state.
 */
export default function OrderActionControls({
  orderId,
  currentStatus,
  currentPaymentStatus,
  currentInvoiceId,
  canCreateInvoice,
}: {
  orderId: string;
  currentStatus: OrderStatus;
  currentPaymentStatus: PaymentStatus;
  currentInvoiceId: string | null;
  canCreateInvoice: boolean;
}) {
  const router = useRouter();
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [newStatus, setNewStatus] = useState<OrderStatus>(currentStatus);
  const [statusNotes, setStatusNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [generatingInvoice, setGeneratingInvoice] = useState(false);

  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [newPaymentStatus, setNewPaymentStatus] = useState<PaymentStatus>(currentPaymentStatus);
  const [savingPayment, setSavingPayment] = useState(false);

  const STATUS_FLOW: OrderStatus[] = ["pending", "confirmed", "processing", "shipped", "delivered"];

  const handleStatusUpdate = async () => {
    if (newStatus === currentStatus) return;
    setSaving(true);
    try {
      const result = await updateOrderStatus(orderId, newStatus, statusNotes || undefined);
      if (newStatus === "delivered" && result.invoiceId) {
        toast.success("Status updated to delivered. Invoice generated.");
      } else if (newStatus === "delivered" && result.invoiceError) {
        // P57: surface the auto-invoice failure to the operator.
        // The status update itself still succeeded (per the
        // P44 design — a failed invoice must not block the
        // status change). The operator can now see WHY the
        // invoice is missing and use the [Generate Invoice]
        // button (when they have the right permission) to retry.
        toast.warning(
          `Status updated to delivered. Invoice was not generated: ${result.invoiceError}`,
          { autoClose: 8000 },
        );
      } else if (newStatus === "delivered") {
        toast.success("Status updated to delivered");
      } else {
        toast.success(`Status updated to ${newStatus}`);
      }
      setShowStatusModal(false);
      setStatusNotes("");
      router.refresh();
    } catch {
      toast.error("Failed to update status");
    } finally {
      setSaving(false);
    }
  };

  const handlePaymentUpdate = async () => {
    if (newPaymentStatus === currentPaymentStatus) return;
    setSavingPayment(true);
    try {
      await updatePaymentStatus(orderId, newPaymentStatus);
      toast.success(`Payment status updated to ${newPaymentStatus}`);
      setShowPaymentModal(false);
      router.refresh();
    } catch {
      toast.error("Failed to update payment status");
    } finally {
      setSavingPayment(false);
    }
  };

  // P57: manual retry. Only visible when the order is delivered
  // but has no invoice (the auto-invoice failed, or the order
  // was marked delivered before the P44 fix shipped). The button
  // is hidden for callers without `invoices:create` (Staff role)
  // because the underlying server action would reject them.
  const handleGenerateInvoice = async () => {
    setGeneratingInvoice(true);
    try {
      const newId = await generateInvoiceForOrder(orderId);
      toast.success(`Invoice generated. ID: ${newId}`);
      router.refresh();
    } catch (err) {
      toast.error(
        `Invoice generation failed: ${(err as Error).message}`,
      );
    } finally {
      setGeneratingInvoice(false);
    }
  };

  const isTerminal = currentStatus === "cancelled" || currentStatus === "returned" || currentStatus === "delivered";
  // P57: a delivered order with no invoice_id is the trigger
  // for the [Generate Invoice] button. We also surface a one-line
  // note in the button so the operator knows why the button is
  // there (vs. assuming it's a "Download" link).
  const needsInvoice = isTerminal && currentStatus === "delivered" && !currentInvoiceId;

  return (
    <>
      <div className="d-flex gap-2 flex-wrap" data-testid="order-action-controls">
        {!isTerminal && (
          <button
            className="btn btn-primary btn-sm"
            onClick={() => setShowStatusModal(true)}
            data-testid="open-status-modal"
          >
            <Icon icon="ri:exchange-line" width={16} className="me-1" />
            Update Status
          </button>
        )}
        <button
          className="btn btn-outline-info btn-sm"
          onClick={() => setShowPaymentModal(true)}
          data-testid="open-payment-modal"
        >
          <Icon icon="ri:money-dollar-circle-line" width={16} className="me-1" />
          Update Payment
        </button>
        {/* P57: manual invoice retry. Same call surface as the
            auto-invoice (generateInvoice from invoices/actions).
            Re-running the same call recomputes the per-store
            sequence, so it's safe to click multiple times — the
            second click would just compute the next seq. */}
        {needsInvoice && canCreateInvoice && (
          <button
            className="btn btn-outline-warning btn-sm"
            onClick={handleGenerateInvoice}
            disabled={generatingInvoice}
            data-testid="generate-invoice"
            title="Auto-invoice failed at delivery. Click to retry."
          >
            <Icon icon="ri:file-text-line" width={16} className="me-1" />
            {generatingInvoice ? "Generating..." : "Generate Invoice"}
          </button>
        )}
      </div>

      {showStatusModal && (
        <div
          style={{
            position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.5)", zIndex: 1050,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
          onClick={() => setShowStatusModal(false)}
        >
          <div
            className="card"
            style={{ width: 420, maxWidth: "90vw" }}
            onClick={(e) => e.stopPropagation()}
            data-testid="status-modal"
          >
            <div className="card-header d-flex justify-content-between align-items-center">
              <strong>Update Order Status</strong>
              <button className="btn-close" onClick={() => setShowStatusModal(false)} />
            </div>
            <div className="card-body">
              <div className="mb-3">
                <label className="form-label">Current Status</label>
                <input type="text" className="form-control" value={currentStatus} disabled />
              </div>
              <div className="mb-3">
                <label className="form-label">New Status</label>
                <select
                  className="form-select"
                  value={newStatus}
                  onChange={(e) => setNewStatus(e.target.value as OrderStatus)}
                  data-testid="status-select"
                >
                  {STATUS_FLOW.map((s) => {
                    const idx = STATUS_FLOW.indexOf(currentStatus as OrderStatus);
                    const newIdx = STATUS_FLOW.indexOf(s);
                    if (s === currentStatus) return null;
                    if (newIdx < idx && s !== "cancelled") return null;
                    return (
                      <option key={s} value={s}>
                        {s.charAt(0).toUpperCase() + s.slice(1)}
                      </option>
                    );
                  })}
                  {currentStatus !== "cancelled" && currentStatus !== "returned" && (
                    <option value="cancelled">Cancel Order</option>
                  )}
                  {currentStatus === "delivered" && <option value="returned">Return</option>}
                </select>
              </div>
              <div className="mb-3">
                <label className="form-label">Notes (optional)</label>
                <textarea
                  className="form-control"
                  rows={3}
                  value={statusNotes}
                  onChange={(e) => setStatusNotes(e.target.value)}
                  placeholder="Reason for status change..."
                  data-testid="status-notes"
                />
              </div>
              <button
                className="btn btn-primary w-100"
                onClick={handleStatusUpdate}
                disabled={saving || newStatus === currentStatus}
                data-testid="confirm-status-update"
              >
                {saving ? "Updating..." : `Update to ${newStatus}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {showPaymentModal && (
        <div
          style={{
            position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.5)", zIndex: 1050,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
          onClick={() => setShowPaymentModal(false)}
        >
          <div
            className="card"
            style={{ width: 400, maxWidth: "90vw" }}
            onClick={(e) => e.stopPropagation()}
            data-testid="payment-modal"
          >
            <div className="card-header d-flex justify-content-between align-items-center">
              <strong>Update Payment Status</strong>
              <button className="btn-close" onClick={() => setShowPaymentModal(false)} />
            </div>
            <div className="card-body">
              <div className="mb-3">
                <label className="form-label">Payment Status</label>
                <select
                  className="form-select"
                  value={newPaymentStatus}
                  onChange={(e) => setNewPaymentStatus(e.target.value as PaymentStatus)}
                  data-testid="payment-select"
                >
                  {(["unpaid", "paid", "refunded", "partially_refunded"] as PaymentStatus[]).map((s) => (
                    <option key={s} value={s}>
                      {s.replace("_", " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                    </option>
                  ))}
                </select>
              </div>
              <button
                className="btn btn-primary w-100"
                onClick={handlePaymentUpdate}
                disabled={savingPayment || newPaymentStatus === currentPaymentStatus}
                data-testid="confirm-payment-update"
              >
                {savingPayment ? "Updating..." : "Update Payment"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
