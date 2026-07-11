"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { Icon } from "@iconify/react";
import { toast } from "react-toastify";
import { runServerAction } from "@/lib/run-server-action";
import { type OrderDetail } from "../actions";
import {
  createReturnRequest,
  listReturnRequestsForOrder,
  getReturnRequestItems,
  updateReturnRequestState,
  deleteReturnRequest,
  type ReturnRequestItemInput,
} from "@/app/(admin)/returns/actions";
import type {
  ReturnRequest,
  ReturnRequestItem,
  ReturnRequestReason,
  ReturnRequestResolution,
  ReturnRequestState,
} from "@/lib/types/supabase";
// P63: client-side date renderer. Avoids hydration mismatches caused
// by server/client timezone divergence in toLocaleString.
import ClientDate from "@/components/ClientDate";

type ActionPermissions = {
  canView: boolean;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
};

const REQUEST_STATE_BADGES: Record<ReturnRequestState, string> = {
  pending:    "bg-warning text-dark",
  received:   "bg-info text-white",
  processing: "bg-primary text-white",
  approved:   "bg-success text-white",
  rejected:   "bg-danger text-white",
  fulfilled:  "bg-dark text-white",
};

const REQUEST_STATE_LABELS: Record<ReturnRequestState, string> = {
  pending:    "Pending",
  received:   "Acknowledged",
  processing: "Processing",
  approved:   "Approved",
  rejected:   "Rejected",
  fulfilled:  "Fulfilled",
};

const REASONS: { value: ReturnRequestReason; label: string }[] = [
  { value: "damaged",           label: "Damaged" },
  { value: "wrong_item",         label: "Wrong item" },
  { value: "not_as_described",   label: "Not as described" },
  { value: "size_fit",           label: "Size / fit" },
  { value: "other",              label: "Other" },
];

const RESOLUTIONS: { value: ReturnRequestResolution; label: string }[] = [
  { value: "full_refund",    label: "Full refund" },
  { value: "partial_refund", label: "Partial refund" },
  { value: "replacement",     label: "Replacement" },
];

/**
 * P62: Return requests panel for the order detail page.
 *
 * Renders below the Items/Timeline row, above the Invoice card.
 * Sections:
 *  1. "Raise return request" button (Manager with canCreate only)
 *     — only when order.status === 'delivered' AND no requests exist.
 *     Opens a form: items selector (checkboxes + qty inputs) + reason.
 *  2. For each existing request (newest first): state badge,
 *     source, reason, items list, decision dates, and Manager
 *     state-machine buttons (Acknowledge / Mark processing / Approve
 *     / Reject / Mark fulfilled) gated by canEdit.
 *  3. "Mark fulfilled" + "Cancel" are Super Admin only (gated by
 *     canDelete; the action checks the role).
 *
 * Hides entirely when the order has no eligible state. For now we
 * show for: status='delivered' OR any return state in orders.status
 * (return_requested / return_processing / return_approved /
 * return_rejected / returned). Always show the "raise" button
 * once the order is delivered.
 */
export default function ReturnRequestsPanel({
  order,
  actionPerms,
}: {
  order: OrderDetail;
  actionPerms?: ActionPermissions;
}) {
  const [requests, setRequests] = useState<ReturnRequest[]>([]);
  const [itemsByRequest, setItemsByRequest] = useState<Record<string, ReturnRequestItem[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Manager-raise form state
  const [showRaiseForm, setShowRaiseForm] = useState(false);
  const [selectedItems, setSelectedItems] = useState<Record<string, number>>({});
  const [raiseReason, setRaiseReason] = useState<ReturnRequestReason>("damaged");
  const [raiseNotes, setRaiseNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // State-machine modal state
  const [approvingFor, setApprovingFor] = useState<ReturnRequest | null>(null);
  const [rejectingFor, setRejectingFor] = useState<ReturnRequest | null>(null);
  const [resolution, setResolution] = useState<ReturnRequestResolution>("full_refund");
  const [partialAmount, setPartialAmount] = useState<string>("");
  const [resolutionNotes, setResolutionNotes] = useState("");
  const [transitioning, setTransitioning] = useState(false);

  // Don't render the panel at all if the order has no eligible state
  // and no requests. We defer the request to after the first fetch.
  const orderEligible = useMemo(() => {
    if (requests.length > 0) return true;
    if (order.status === "delivered") return true;
    if (
      order.status === "return_requested" ||
      order.status === "return_processing" ||
      order.status === "return_approved" ||
      order.status === "return_rejected" ||
      order.status === "returned"
    ) {
      return true;
    }
    return false;
  }, [order.status, requests.length]);

  const fetchAll = async () => {
    setLoading(true);
    setError(null);
    const listResult = await runServerAction(listReturnRequestsForOrder, order.id);
    if (!listResult.ok) {
      setError(listResult.error.message);
      setLoading(false);
      return;
    }
    setRequests(listResult.value);
    // Fetch items for each request.
    const itemMap: Record<string, ReturnRequestItem[]> = {};
    for (const req of listResult.value) {
      const itemsResult = await runServerAction(getReturnRequestItems, req.id);
      if (itemsResult.ok) {
        itemMap[req.id] = itemsResult.value;
      }
    }
    setItemsByRequest(itemMap);
    setLoading(false);
  };

  // Track which fetchAll calls are still relevant. When a newer
  // order.status / requests.length arrives, we cancel the in-flight
  // fetch so the OLDER fetchAll doesn't overwrite the newer state
  // (race-condition avoidance). This is the reason we use a
  // useEffect rather than computing the data during render.
  const cancelledRef = useRef(false);
  const setLoadingIfActive = (v: boolean) => {
    if (!cancelledRef.current) setLoading(v);
  };
  useEffect(() => {
    cancelledRef.current = false;
    if (!orderEligible) {
      setLoadingIfActive(false);
      return;
    }
    setLoadingIfActive(true);
    void (async () => {
      const listResult = await runServerAction(listReturnRequestsForOrder, order.id);
      if (cancelledRef.current) return;
      if (!listResult.ok) {
        setError(listResult.error.message);
        setLoadingIfActive(false);
        return;
      }
      setRequests(listResult.value);
      const itemMap: Record<string, ReturnRequestItem[]> = {};
      for (const req of listResult.value) {
        const itemsResult = await runServerAction(getReturnRequestItems, req.id);
        if (cancelledRef.current) return;
        if (itemsResult.ok) {
          itemMap[req.id] = itemsResult.value;
        }
      }
      if (cancelledRef.current) return;
      setItemsByRequest(itemMap);
      setLoadingIfActive(false);
    })();
    return () => {
      cancelledRef.current = true;
    };
  }, [order.id, order.status, requests.length]);

  if (!orderEligible) return null;

  const handleRaise = async (e: React.FormEvent) => {
    e.preventDefault();
    const items: ReturnRequestItemInput[] = Object.entries(selectedItems)
      .filter(([, qty]) => qty > 0)
      .map(([orderItemId, quantity]) => ({ order_item_id: orderItemId, quantity }));
    if (items.length === 0) {
      toast.error("Select at least one item with a quantity > 0");
      return;
    }
    setSubmitting(true);
    const result = await runServerAction(createReturnRequest, {
      orderId: order.id,
      source: "manager",
      reason: raiseReason,
      customerNotes: raiseNotes.trim() || undefined,
      items,
    });
    setSubmitting(false);
    if (!result.ok) {
      toast.error(result.error.message);
      return;
    }
    toast.success("Return request raised");
    setShowRaiseForm(false);
    setSelectedItems({});
    setRaiseNotes("");
    setRaiseReason("damaged");
    void fetchAll();
  };

  const handleTransition = async (
    request: ReturnRequest,
    toState: ReturnRequestState,
    opts?: {
      resolution?: ReturnRequestResolution;
      resolutionAmount?: number;
      managerNotes?: string;
      gatewayRefundId?: string;
    },
  ) => {
    setTransitioning(true);
    const result = await runServerAction(updateReturnRequestState, {
      requestId: request.id,
      toState,
      resolution: opts?.resolution,
      resolutionAmount: opts?.resolutionAmount,
      managerNotes: opts?.managerNotes,
      gatewayRefundId: opts?.gatewayRefundId,
    });
    setTransitioning(false);
    if (!result.ok) {
      toast.error(result.error.message);
      return;
    }
    toast.success(`Marked as ${REQUEST_STATE_LABELS[toState]}`);
    setApprovingFor(null);
    setRejectingFor(null);
    setResolutionNotes("");
    setPartialAmount("");
    void fetchAll();
  };

  const handleDelete = async (request: ReturnRequest) => {
    if (!window.confirm("Hard-delete this return request? The order will be reverted to its previous state.")) return;
    const result = await runServerAction(deleteReturnRequest, request.id);
    if (!result.ok) {
      toast.error(result.error.message);
      return;
    }
    toast.success("Return request deleted");
    void fetchAll();
  };

  // ---------- RENDER ----------

  return (
    <div className="card mt-2" data-testid="return-requests-panel">
      <div className="card-header d-flex align-items-center gap-2">
        <Icon icon="ri:arrow-go-back-line" width={18} />
        <strong>Return Requests</strong>
        {requests.length > 0 && (
          <span className="badge bg-light text-muted ms-2" data-testid="return-requests-count">
            {requests.length}
          </span>
        )}
        {actionPerms?.canCreate && order.status === "delivered" && !showRaiseForm && (
          <button
            type="button"
            className="btn btn-sm btn-outline-primary ms-auto"
            onClick={() => setShowRaiseForm((v) => !v)}
            data-testid="raise-return-request-btn"
          >
            <Icon icon="ri:add-line" className="me-1" />
            Raise return request
          </button>
        )}
      </div>
      <div className="card-body">
        {error && (
          <div className="alert alert-danger py-2 mb-2">{error}</div>
        )}

        {/* Manager-raise form */}
        {showRaiseForm && (
          <form onSubmit={handleRaise} className="mb-3 p-3 border rounded" data-testid="raise-return-form">
            <div className="mb-2 fw-semibold">Raise return request (Manager-initiated — bypasses SLA)</div>
            <div className="mb-2 small text-muted">
              Tick the items being returned, set the quantity, and pick a reason.
            </div>
            <div className="table-responsive mb-2" style={{ maxHeight: 240, overflowY: "auto" }}>
              <table className="table table-sm table-bordered mb-0">
                <thead className="table-light">
                  <tr>
                    <th style={{ width: 32 }}></th>
                    <th>Product</th>
                    <th style={{ width: 90 }}>Qty</th>
                    <th>Max</th>
                  </tr>
                </thead>
                <tbody>
                  {order.order_items.map((oi) => {
                    const included = selectedItems[oi.id] != null && selectedItems[oi.id] > 0;
                    return (
                      <tr key={oi.id}>
                        <td>
                          <input
                            type="checkbox"
                            className="form-check-input"
                            checked={included}
                            onChange={(e) => {
                              setSelectedItems((prev) => {
                                const next = { ...prev };
                                if (e.target.checked) {
                                  next[oi.id] = oi.quantity;
                                } else {
                                  delete next[oi.id];
                                }
                                return next;
                              });
                            }}
                            data-testid={`raise-item-check-${oi.id}`}
                          />
                        </td>
                        <td>
                          {oi.product_name ?? oi.products?.name ?? "(deleted)"}
                          {oi.variant_name ? ` — ${oi.variant_name}` : ""}
                        </td>
                        <td>
                          <input
                            type="number"
                            className="form-control form-control-sm"
                            min={1}
                            max={oi.quantity}
                            step={1}
                            value={selectedItems[oi.id] ?? 0}
                            disabled={!included}
                            onChange={(e) => {
                              const v = Number(e.target.value);
                              setSelectedItems((prev) => ({
                                ...prev,
                                [oi.id]: isNaN(v) ? 0 : Math.min(Math.max(0, v), oi.quantity),
                              }));
                            }}
                            data-testid={`raise-item-qty-${oi.id}`}
                          />
                        </td>
                        <td>{oi.quantity}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="row g-2 mb-2">
              <div className="col-md-4">
                <label className="form-label small">Reason</label>
                <select
                  className="form-select form-select-sm"
                  value={raiseReason}
                  onChange={(e) => setRaiseReason(e.target.value as ReturnRequestReason)}
                  data-testid="raise-reason-select"
                >
                  {REASONS.map((r) => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </select>
              </div>
              <div className="col-md-8">
                <label className="form-label small">Notes (optional)</label>
                <input
                  type="text"
                  className="form-control form-control-sm"
                  value={raiseNotes}
                  onChange={(e) => setRaiseNotes(e.target.value)}
                  placeholder="Optional context for the customer"
                />
              </div>
            </div>
            <div className="d-flex gap-2 justify-content-end">
              <button
                type="button"
                className="btn btn-outline-secondary btn-sm"
                onClick={() => {
                  setShowRaiseForm(false);
                  setSelectedItems({});
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn btn-primary btn-sm"
                disabled={submitting}
                data-testid="raise-submit-btn"
              >
                {submitting ? "Submitting..." : "Submit"}
              </button>
            </div>
          </form>
        )}

        {loading ? (
          <div className="text-center text-muted py-2">
            <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true" />
            Loading return requests...
          </div>
        ) : requests.length === 0 ? (
          <div className="text-muted small" data-testid="no-return-requests">
            No return requests for this order.
          </div>
        ) : (
          <div className="d-flex flex-column gap-2">
            {requests.map((req) => (
              <RequestCard
                key={req.id}
                request={req}
                items={itemsByRequest[req.id] ?? []}
                actionPerms={actionPerms}
                onDelete={() => handleDelete(req)}
                transitioning={transitioning}
              />
            ))}
          </div>
        )}
      </div>

      {/* Approve sub-modal */}
      {approvingFor && (
        <ApproveModal
          request={approvingFor}
          resolution={resolution}
          setResolution={setResolution}
          partialAmount={partialAmount}
          setPartialAmount={setPartialAmount}
          resolutionNotes={resolutionNotes}
          setResolutionNotes={setResolutionNotes}
          items={itemsByRequest[approvingFor.id] ?? []}
          onClose={() => setApprovingFor(null)}
          onConfirm={() => {
            const opts: {
              resolution: ReturnRequestResolution;
              resolutionAmount?: number;
              managerNotes?: string;
            } = { resolution };
            if (resolution === "partial_refund") {
              const amt = Number(partialAmount);
              if (!isNaN(amt) && amt > 0) opts.resolutionAmount = amt;
            }
            if (resolutionNotes.trim()) opts.managerNotes = resolutionNotes.trim();
            handleTransition(approvingFor, "approved", opts);
          }}
          transitioning={transitioning}
        />
      )}

      {/* Reject sub-modal */}
      {rejectingFor && (
        <RejectModal
          request={rejectingFor}
          managerNotes={resolutionNotes}
          setManagerNotes={setResolutionNotes}
          onClose={() => setRejectingFor(null)}
          onConfirm={() => {
            handleTransition(rejectingFor, "rejected", {
              managerNotes: resolutionNotes.trim() || undefined,
            });
          }}
          transitioning={transitioning}
        />
      )}
    </div>
  );
}

// ---------- Sub-components ----------

function RequestCard({
  request: req,
  items,
  actionPerms,
  onDelete,
  transitioning,
}: {
  request: ReturnRequest;
  items: ReturnRequestItem[];
  actionPerms?: ActionPermissions;
  onDelete: () => void;
  transitioning: boolean;
}) {
  const canEdit = actionPerms?.canEdit === true;
  const canDelete = actionPerms?.canDelete === true;
  const decidedByLabel = req.decided_by ? `by ${req.decided_by}` : "";
  return (
    <div className="border rounded p-2" data-testid={`return-request-${req.id}`}>
      <div className="d-flex align-items-center gap-2 mb-1 flex-wrap">
        <span
          className={`badge ${REQUEST_STATE_BADGES[req.state]}`}
          data-testid={`return-request-state-${req.id}`}
        >
          {REQUEST_STATE_LABELS[req.state]}
        </span>
        <span className="badge bg-light text-muted">{req.source}</span>
        <span className="text-muted small">Reason: <strong>{req.reason}</strong></span>
        <span className="text-muted small ms-auto" data-testid={`return-request-created-${req.id}`}>
          Raised <ClientDate value={req.created_at} format="datetime" />
        </span>
      </div>
      {items.length > 0 && (
        <ul className="small mb-2 ms-3" data-testid={`return-request-items-${req.id}`}>
          {items.map((it) => (
            <li key={it.id}>
              order_item <code>{it.order_item_id.slice(0, 8)}</code>: {it.quantity} unit
              {it.quantity === 1 ? "" : "s"}
            </li>
          ))}
        </ul>
      )}
      {req.resolution && (
        <div className="small text-muted">
          Resolution: <strong>{req.resolution}</strong>
          {req.resolution_amount != null && (
            <> · amount: ₹{req.resolution_amount.toFixed(2)}</>
          )}
          {req.gateway_refund_id && (
            <> · gateway_refund_id: <code>{req.gateway_refund_id}</code></>
          )}
        </div>
      )}
      {req.manager_notes && (
        <div className="small text-muted">Manager notes: {req.manager_notes}</div>
      )}
      {req.decided_at && (
        <div className="small text-muted">
          Decided <ClientDate value={req.decided_at} format="datetime" /> {decidedByLabel}
        </div>
      )}
      {req.fulfilled_at && (
        <div className="small text-muted">
          Fulfilled <ClientDate value={req.fulfilled_at} format="datetime" />
        </div>
      )}

      {canDelete && (
        <div className="d-flex flex-wrap gap-1 mt-2">
          <button type="button" className="btn btn-sm btn-outline-danger ms-auto"
            onClick={onDelete} disabled={transitioning}
            data-testid={`return-request-delete-btn-${req.id}`}>
            Delete
          </button>
        </div>
      )}
    </div>
  );
}

function ApproveModal({
  request,
  resolution,
  setResolution,
  partialAmount,
  setPartialAmount,
  resolutionNotes,
  setResolutionNotes,
  items,
  onClose,
  onConfirm,
  transitioning,
}: {
  request: ReturnRequest;
  resolution: ReturnRequestResolution;
  setResolution: (r: ReturnRequestResolution) => void;
  partialAmount: string;
  setPartialAmount: (s: string) => void;
  resolutionNotes: string;
  setResolutionNotes: (s: string) => void;
  items: ReturnRequestItem[];
  onClose: () => void;
  onConfirm: () => void;
  transitioning: boolean;
}) {
  return (
    <div
      className="position-fixed top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center"
      style={{ background: "rgba(0,0,0,0.5)", zIndex: 1050 }}
      data-testid="approve-modal"
    >
      <div className="bg-white rounded-3 shadow" style={{ width: 480, maxWidth: "90vw" }}>
        <div className="px-4 py-3 border-bottom">
          <h6 className="fw-bold mb-0">Approve return request</h6>
          <div className="text-muted small mt-1">
            {items.length} item{items.length === 1 ? "" : "s"} will be {resolution === "replacement" ? "replaced" : "refunded"}.
          </div>
        </div>
        <div className="p-4">
          <div className="mb-3">
            <label className="form-label small">Resolution</label>
            <select
              className="form-select form-select-sm"
              value={resolution}
              onChange={(e) => setResolution(e.target.value as ReturnRequestResolution)}
              data-testid="approve-resolution-select"
            >
              {RESOLUTIONS.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
            <div className="form-text small">
              {resolution === "partial_refund"
                ? "Server auto-computes the amount from the items' prices. Leave the field empty to accept the auto-computed value, or override."
                : resolution === "full_refund"
                ? "Full refund for the selected items."
                : "Replacement: no payment change. Ship a new product to the customer."}
            </div>
          </div>
          {resolution === "partial_refund" && (
            <div className="mb-3">
              <label className="form-label small">Override amount (optional)</label>
              <input
                type="number"
                className="form-control form-control-sm"
                placeholder="Auto-computed if empty"
                min={0.01}
                step={0.01}
                value={partialAmount}
                onChange={(e) => setPartialAmount(e.target.value)}
                data-testid="approve-partial-amount-input"
              />
            </div>
          )}
          <div className="mb-3">
            <label className="form-label small">Manager notes (optional)</label>
            <input
              type="text"
              className="form-control form-control-sm"
              value={resolutionNotes}
              onChange={(e) => setResolutionNotes(e.target.value)}
            />
          </div>
        </div>
        <div className="d-flex justify-content-end gap-2 px-4 py-3 border-top">
          <button type="button" className="btn btn-outline-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-success" onClick={onConfirm} disabled={transitioning}
            data-testid="approve-confirm-btn">
            {transitioning ? "Approving..." : "Approve"}
          </button>
        </div>
      </div>
    </div>
  );
}

function RejectModal({
  request,
  managerNotes,
  setManagerNotes,
  onClose,
  onConfirm,
  transitioning,
}: {
  request: ReturnRequest;
  managerNotes: string;
  setManagerNotes: (s: string) => void;
  onClose: () => void;
  onConfirm: () => void;
  transitioning: boolean;
}) {
  return (
    <div
      className="position-fixed top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center"
      style={{ background: "rgba(0,0,0,0.5)", zIndex: 1050 }}
      data-testid="reject-modal"
    >
      <div className="bg-white rounded-3 shadow" style={{ width: 400, maxWidth: "90vw" }}>
        <div className="px-4 py-3 border-bottom">
          <h6 className="fw-bold mb-0">Reject return request</h6>
          <div className="text-muted small mt-1">
            The order will be reverted to &ldquo;delivered&rdquo;.
          </div>
        </div>
        <div className="p-4">
          <label className="form-label small">Manager notes (optional)</label>
          <input
            type="text"
            className="form-control form-control-sm"
            value={managerNotes}
            onChange={(e) => setManagerNotes(e.target.value)}
            data-testid="reject-notes-input"
          />
        </div>
        <div className="d-flex justify-content-end gap-2 px-4 py-3 border-top">
          <button type="button" className="btn btn-outline-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-danger" onClick={onConfirm} disabled={transitioning}
            data-testid="reject-confirm-btn">
            {transitioning ? "Rejecting..." : "Reject"}
          </button>
        </div>
      </div>
    </div>
  );
}
