"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@iconify/react";
import { toast } from "react-toastify";
import {
  updateOrderStatus,
  updatePaymentStatus,
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
 * Behavior matches the original implementation exactly:
 *   - Update Status button hidden when the order is already
 *     terminal (cancelled / returned / delivered) — keeps the
 *     action surface focused.
 *   - Update Payment button always shown (you can re-mark a paid
 *     order as refunded, etc.).
 *   - Status modal restricts options to forward-only flow + the
 *     explicit Cancel/Return escape hatches, with notes for
 *     forensic context (P50 logs cancelled/returned transitions).
 *   - P44 toast on delivered (invoice auto-generated).
 *   - Both actions call router.refresh() so the surrounding
 *     page picks up the new state.
 */
export default function OrderActionControls({
  orderId,
  currentStatus,
  currentPaymentStatus,
}: {
  orderId: string;
  currentStatus: OrderStatus;
  currentPaymentStatus: PaymentStatus;
}) {
  const router = useRouter();
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [newStatus, setNewStatus] = useState<OrderStatus>(currentStatus);
  const [statusNotes, setStatusNotes] = useState("");
  const [saving, setSaving] = useState(false);

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

  const isTerminal = currentStatus === "cancelled" || currentStatus === "returned" || currentStatus === "delivered";

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
