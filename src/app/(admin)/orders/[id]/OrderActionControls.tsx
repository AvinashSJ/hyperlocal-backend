"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@iconify/react";
import { toast } from "react-toastify";
import { runServerAction } from "@/lib/run-server-action";
import { listReturnRequestsForOrder, updateReturnRequestState } from "@/app/(admin)/returns/actions";
import {
  updateOrderStatus,
  updatePaymentStatus,
  generateInvoiceForOrder,
  type OrderStatus,
  type PaymentStatus,
} from "../actions";
import type { ReturnRequestState } from "@/lib/types/supabase";

/**
 * P54: Reusable status + payment controls.
 *
 * P62a: "Manage Return" button opens a modal with a single
 * state-machine dropdown instead of multiple action buttons.
 * The modal auto-detects the latest pending return request for
 * the order and shows only legal transitions for its current
 * state.
 */

const RETURN_TRANSITION_LABELS: Record<string, string> = {
  received: "Acknowledge (Received)",
  processing: "Mark Processing",
  approved: "Approve",
  rejected: "Reject",
  fulfilled: "Mark Fulfilled",
};

const RETURN_TRANSITION_BTN_CLASS: Record<string, string> = {
  received: "btn-info",
  processing: "btn-primary",
  approved: "btn-success",
  rejected: "btn-danger",
  fulfilled: "btn-success",
};

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
  const [statusModalPayment, setStatusModalPayment] = useState<PaymentStatus>(currentPaymentStatus);

  const [showReturnModal, setShowReturnModal] = useState(false);
  const [returnRequests, setReturnRequests] = useState<Array<{ id: string; state: string; reason: string }>>([]);
  const [selectedReturnRequestId, setSelectedReturnRequestId] = useState<string>("");
  const [selectedTransition, setSelectedTransition] = useState<string>("");
  const [returnResolution, setReturnResolution] = useState<string>("full_refund");
  const [returnPartialAmount, setReturnPartialAmount] = useState("");
  const [returnManagerNotes, setReturnManagerNotes] = useState("");
  const [returnPaymentStatus, setReturnPaymentStatus] = useState<PaymentStatus>(currentPaymentStatus);
  const [savingReturn, setSavingReturn] = useState(false);

  const STATUS_FLOW: OrderStatus[] = ["pending", "confirmed", "processing", "out_for_delivery", "delivered"];

  const handleStatusUpdate = async () => {
    if (newStatus === currentStatus && statusModalPayment === currentPaymentStatus) return;
    setSaving(true);
    try {
      const result = await updateOrderStatus(orderId, newStatus, statusNotes || undefined);
      if (newStatus === "processing" && result.invoiceId) {
        toast.success("Status updated to processing. Invoice generated.");
      } else if (newStatus === "processing" && result.invoiceError) {
        toast.warning(
          `Status updated to processing. Invoice was not generated: ${result.invoiceError}`,
          { autoClose: 8000 },
        );
      } else if (newStatus === "delivered") {
        toast.success("Status updated to delivered");
      } else {
        toast.success(`Status updated to ${newStatus}`);
      }
      if (statusModalPayment !== currentPaymentStatus) {
        await updatePaymentStatus(orderId, statusModalPayment);
        toast.success(`Payment status updated to ${statusModalPayment}`);
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

  const handleOpenReturnModal = async () => {
    setReturnManagerNotes("");
    setSelectedTransition("");
    setReturnResolution("full_refund");
    setReturnPartialAmount("");
    setReturnPaymentStatus(currentPaymentStatus);
    const result = await runServerAction(listReturnRequestsForOrder, orderId);
    if (!result.ok) {
      toast.error(result.error.message);
      return;
    }
    const active = result.value.filter(
      (r) => r.state !== "fulfilled" && r.state !== "rejected",
    );
    if (active.length === 0) {
      toast.info("No active return requests for this order.");
      return;
    }
    setReturnRequests(active.map((r) => ({ id: r.id, state: r.state, reason: r.reason })));
    setSelectedReturnRequestId(active[0].id);
    setShowReturnModal(true);
  };

  const handleReturnSubmit = async () => {
    if (!selectedReturnRequestId || !selectedTransition) return;
    setSavingReturn(true);
    const returnResult = await runServerAction(updateReturnRequestState, {
      requestId: selectedReturnRequestId,
      toState: selectedTransition as ReturnRequestState,
      ...(selectedTransition === "approved" ? { resolution: returnResolution as "full_refund" | "partial_refund" | "replacement" } : {}),
      ...(selectedTransition === "approved" && returnResolution === "partial_refund" && returnPartialAmount ? { resolutionAmount: Number(returnPartialAmount) } : {}),
      ...(returnManagerNotes.trim() ? { managerNotes: returnManagerNotes.trim() } : {}),
    });
    if (!returnResult.ok) {
      setSavingReturn(false);
      toast.error(returnResult.error.message);
      return;
    }
    toast.success(`Return ${RETURN_TRANSITION_LABELS[selectedTransition] ?? selectedTransition}`);
    // Also update payment status if changed.
    if (returnPaymentStatus !== currentPaymentStatus) {
      try {
        await updatePaymentStatus(orderId, returnPaymentStatus);
        toast.success(`Payment status updated to ${returnPaymentStatus}`);
      } catch {
        toast.error("Failed to update payment status");
      }
    }
    setSavingReturn(false);
    setShowReturnModal(false);
    router.refresh();
  };

  const isTerminal = currentStatus === "cancelled" || currentStatus === "returned" || currentStatus === "delivered";
  const isReturnWorkflow = currentStatus.startsWith("return_");
  const needsInvoice = currentStatus === "delivered" && !currentInvoiceId;

  const legalTransitions: Record<string, string[]> = {
    pending: ["received", "processing", "approved", "rejected"],
    received: ["processing", "approved", "rejected"],
    processing: ["approved", "rejected"],
    approved: ["fulfilled"],
  };

  return (
    <>
      <div className="d-flex gap-2 flex-wrap" data-testid="order-action-controls">
        {!isTerminal && (isReturnWorkflow ? (
          <button
            className="btn btn-outline-warning btn-sm"
            onClick={handleOpenReturnModal}
            data-testid="open-return-modal"
          >
            <Icon icon="ri:arrow-go-back-line" width={16} className="me-1" />
            Manage Return
          </button>
        ) : (
          <>
            <button
              className="btn btn-primary btn-sm"
              onClick={() => setShowStatusModal(true)}
              data-testid="open-status-modal"
            >
              <Icon icon="ri:exchange-line" width={16} className="me-1" />
              Update Status
            </button>
            {(currentStatus as string) === "delivered" && (
              <button
                className="btn btn-outline-warning btn-sm"
                onClick={handleOpenReturnModal}
                data-testid="open-return-modal"
              >
                <Icon icon="ri:arrow-go-back-line" width={16} className="me-1" />
                Manage Return
              </button>
            )}
          </>
        ))}
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
                        {s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
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
              <div className="mb-3">
                <label className="form-label">Payment</label>
                <select
                  className="form-select"
                  value={statusModalPayment}
                  onChange={(e) => setStatusModalPayment(e.target.value as PaymentStatus)}
                  data-testid="status-payment-select"
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
                onClick={handleStatusUpdate}
                disabled={saving || (newStatus === currentStatus && statusModalPayment === currentPaymentStatus)}
                data-testid="confirm-status-update"
              >
                {saving ? "Updating..." : `Update to ${newStatus}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {showReturnModal && (
        <div
          style={{
            position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.5)", zIndex: 1050,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
          onClick={() => setShowReturnModal(false)}
        >
          <div
            className="card"
            style={{ width: 420, maxWidth: "90vw" }}
            onClick={(e) => e.stopPropagation()}
            data-testid="return-modal"
          >
            <div className="card-header d-flex justify-content-between align-items-center">
              <strong>Manage Return</strong>
              <button className="btn-close" onClick={() => setShowReturnModal(false)} />
            </div>
            <div className="card-body">
              {returnRequests.length > 1 && (
                <div className="mb-3">
                  <label className="form-label">Return Request</label>
                  <select
                    className="form-select"
                    value={selectedReturnRequestId}
                    onChange={(e) => {
                      const req = returnRequests.find((r) => r.id === e.target.value);
                      setSelectedReturnRequestId(e.target.value);
                      setSelectedTransition("");
                      if (req) setSelectedTransition(req.state === "pending" ? "received" : "");
                    }}
                    data-testid="return-request-select"
                  >
                    {returnRequests.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.reason} ({r.state})
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div className="mb-3">
                <label className="form-label">Return State</label>
                <input
                  type="text"
                  className="form-control"
                  value={returnRequests.find((r) => r.id === selectedReturnRequestId)?.state ?? ""}
                  disabled
                />
              </div>
              {selectedReturnRequestId && (
                <div className="mb-3">
                  <label className="form-label">Next Step</label>
                  <select
                    className="form-select"
                    value={selectedTransition}
                    onChange={(e) => setSelectedTransition(e.target.value)}
                    data-testid="return-transition-select"
                  >
                    <option value="">— Select —</option>
                    {(legalTransitions[returnRequests.find((r) => r.id === selectedReturnRequestId)?.state ?? ""] ?? [])
                      .map((s) => (
                        <option key={s} value={s}>
                          {RETURN_TRANSITION_LABELS[s] ?? s}
                        </option>
                      ))}
                  </select>
                </div>
              )}
              {selectedTransition === "approved" && (
                <div className="mb-3">
                  <label className="form-label">Resolution</label>
                  <select
                    className="form-select"
                    value={returnResolution}
                    onChange={(e) => setReturnResolution(e.target.value)}
                    data-testid="return-resolution-select"
                  >
                    <option value="full_refund">Full Refund</option>
                    <option value="partial_refund">Partial Refund</option>
                    <option value="replacement">Replacement</option>
                  </select>
                  {returnResolution === "partial_refund" && (
                    <div className="mt-2">
                      <label className="form-label">Override Amount (optional)</label>
                      <input
                        type="number"
                        className="form-control"
                        min={0.01}
                        step={0.01}
                        value={returnPartialAmount}
                        onChange={(e) => setReturnPartialAmount(e.target.value)}
                        placeholder="Auto-computed if empty"
                        data-testid="return-partial-amount-input"
                      />
                    </div>
                  )}
                </div>
              )}
              <div className="mb-3">
                <label className="form-label">Manager Notes (optional)</label>
                <textarea
                  className="form-control"
                  rows={2}
                  value={returnManagerNotes}
                  onChange={(e) => setReturnManagerNotes(e.target.value)}
                  placeholder="Notes for this transition..."
                  data-testid="return-notes"
                />
              </div>
              <div className="mb-3">
                <label className="form-label">Payment</label>
                <select
                  className="form-select"
                  value={returnPaymentStatus}
                  onChange={(e) => setReturnPaymentStatus(e.target.value as PaymentStatus)}
                  data-testid="return-payment-select"
                >
                  {(["unpaid", "paid", "refunded", "partially_refunded"] as PaymentStatus[]).map((s) => (
                    <option key={s} value={s}>
                      {s.replace("_", " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                    </option>
                  ))}
                </select>
              </div>
              <button
                className={`btn w-100 ${RETURN_TRANSITION_BTN_CLASS[selectedTransition] ?? "btn-primary"}`}
                onClick={handleReturnSubmit}
                disabled={savingReturn || !selectedTransition}
                data-testid="confirm-return-transition"
              >
                {savingReturn
                  ? "Updating..."
                  : selectedTransition
                  ? RETURN_TRANSITION_LABELS[selectedTransition] ?? selectedTransition
                  : "Select a step"}
              </button>
            </div>
          </div>
        </div>
      )}

    </>
  );
}
