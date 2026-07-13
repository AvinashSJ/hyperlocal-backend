"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@iconify/react";
import { updateTicketStatus, respondToTicket } from "../actions";
import type { TicketDetail } from "../actions";

const STATUS_FLOW: { value: string; label: string; icon: string; color: string }[] = [
  { value: "open", label: "Open", icon: "ri:mail-unread-line", color: "warning" },
  { value: "in_progress", label: "In Progress", icon: "ri:loader-4-line", color: "info" },
  { value: "resolved", label: "Resolved", icon: "ri:check-circle-line", color: "success" },
  { value: "closed", label: "Closed", icon: "ri:lock-line", color: "secondary" },
];

function currentIndex(status: string): number {
  return STATUS_FLOW.findIndex((s) => s.value === status);
}

export default function SupportTicketDetailClient({
  ticket,
}: {
  ticket: TicketDetail;
}) {
  const router = useRouter();
  const [localTicket, setLocalTicket] = useState(ticket);
  const [responseText, setResponseText] = useState(localTicket.admin_response ?? "");
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [responding, setResponding] = useState(false);

  const idx = currentIndex(localTicket.status);

  const handleStatusChange = async (newStatus: string) => {
    setStatusUpdating(true);
    try {
      await updateTicketStatus(localTicket.id, newStatus as TicketDetail["status"]);
      setLocalTicket((prev) => ({
        ...prev,
        status: newStatus as TicketDetail["status"],
        resolved_at: newStatus === "resolved" || newStatus === "closed"
          ? new Date().toISOString() : null,
      }));
    } catch {
      alert("Failed to update status");
    } finally {
      setStatusUpdating(false);
    }
  };

  const handleRespond = async () => {
    if (!responseText.trim()) return;
    setResponding(true);
    try {
      await respondToTicket(localTicket.id, responseText.trim());
      setLocalTicket((prev) => ({ ...prev, admin_response: responseText.trim() }));
      router.refresh();
    } catch {
      alert("Failed to save response");
    } finally {
      setResponding(false);
    }
  };

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-4">
        <div>
          <a href="/support" className="text-decoration-none text-muted small">
            &larr; Back to Support Tickets
          </a>
          <h4 className="fw-bold mt-1 mb-0">{localTicket.subject}</h4>
        </div>
        <span className={`badge bg-${STATUS_FLOW[idx]?.color ?? "secondary"} fs-6`}>
          <Icon icon={STATUS_FLOW[idx]?.icon ?? "ri:question-line"} className="me-1" />
          {STATUS_FLOW[idx]?.label ?? localTicket.status}
        </span>
      </div>

      <div className="row g-4">
        {/* Main: message + response */}
        <div className="col-lg-8">
          {/* Original message */}
          <div className="card mb-3">
            <div className="card-header d-flex justify-content-between align-items-center">
              <span className="fw-medium">{localTicket.customer_name ?? "Customer"}</span>
              <small className="text-muted">
                {new Date(localTicket.created_at).toLocaleString()}
              </small>
            </div>
            <div className="card-body">
              <p className="card-text mb-0" style={{ whiteSpace: "pre-wrap" }}>
                {localTicket.message}
              </p>
            </div>
          </div>

          {/* Admin response */}
          {localTicket.admin_response && (
            <div className="card mb-3 border-primary">
              <div className="card-header d-flex justify-content-between align-items-center text-primary">
                <span className="fw-medium">Your Response</span>
                <small className="text-muted">
                  {localTicket.updated_at !== localTicket.created_at
                    ? new Date(localTicket.updated_at).toLocaleString()
                    : ""}
                </small>
              </div>
              <div className="card-body">
                <p className="card-text mb-0" style={{ whiteSpace: "pre-wrap" }}>
                  {localTicket.admin_response}
                </p>
              </div>
            </div>
          )}

          {/* Response form */}
          <div className="card">
            <div className="card-header">
              <span className="fw-medium">Respond to Customer</span>
            </div>
            <div className="card-body">
              <div className="mb-3">
                <textarea
                  className="form-control"
                  rows={4}
                  value={responseText}
                  onChange={(e) => setResponseText(e.target.value)}
                  placeholder="Type your response here..."
                />
              </div>
              <button
                className="btn btn-primary"
                onClick={handleRespond}
                disabled={responding || !responseText.trim()}
              >
                {responding ? (
                  <>
                    <Icon icon="ri:loader-4-line" className="spinner me-1" />
                    Sending...
                  </>
                ) : (
                  <>
                    <Icon icon="ri:send-plane-line" className="me-1" />
                    Send Response
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Sidebar: status + details */}
        <div className="col-lg-4">
          {/* Status flow */}
          <div className="card mb-3">
            <div className="card-header">
              <span className="fw-medium">Status</span>
            </div>
            <div className="card-body">
              <div className="d-flex flex-column gap-2">
                {STATUS_FLOW.map((s, i) => {
                  const disabled = statusUpdating || Math.abs(i - idx) > 1 || i < idx;
                  return (
                    <button
                      key={s.value}
                      className={`btn btn-outline-${s.color} btn-sm d-flex align-items-center gap-2 ${localTicket.status === s.value ? "active" : ""}`}
                      disabled={disabled}
                      onClick={() => handleStatusChange(s.value)}
                    >
                      <Icon icon={s.icon} />
                      {s.label}
                    </button>
                  );
                })}
              </div>
              {localTicket.resolved_at && (
                <small className="text-muted d-block mt-2">
                  Resolved: {new Date(localTicket.resolved_at).toLocaleDateString()}
                </small>
              )}
            </div>
          </div>

          {/* Details */}
          <div className="card">
            <div className="card-header">
              <span className="fw-medium">Details</span>
            </div>
            <div className="card-body">
              <dl className="mb-0 small">
                <dt>Priority</dt>
                <dd className="text-capitalize mb-2">{localTicket.priority}</dd>
                <dt>Customer</dt>
                <dd className="mb-2">{localTicket.customer_name ?? "—"}</dd>
                <dt>Assigned To</dt>
                <dd className="mb-2">{localTicket.assigned_name ?? "Unassigned"}</dd>
                <dt>Created</dt>
                <dd className="mb-2">
                  {new Date(localTicket.created_at).toLocaleString()}
                </dd>
                <dt>Last Updated</dt>
                <dd className="mb-0">
                  {new Date(localTicket.updated_at).toLocaleString()}
                </dd>
              </dl>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
