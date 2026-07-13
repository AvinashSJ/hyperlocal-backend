"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { TicketListItem } from "./actions";

const STATUS_BADGES: Record<string, string> = {
  open: "bg-warning text-dark",
  in_progress: "bg-info text-white",
  resolved: "bg-success text-white",
  closed: "bg-secondary text-white",
};

const PRIORITY_BADGES: Record<string, string> = {
  low: "bg-light text-dark",
  medium: "bg-warning text-dark",
  high: "bg-danger text-white",
  urgent: "bg-dark text-white",
};

export default function SupportTicketsClient({
  tickets,
}: {
  tickets: TicketListItem[];
}) {
  const pathname = usePathname();

  if (tickets.length === 0) {
    return (
      <div className="text-center py-5 text-muted">
        <p className="mb-0">No support tickets yet.</p>
      </div>
    );
  }

  return (
    <div className="table-responsive">
      <table className="table table-hover align-middle">
        <thead className="table-light">
          <tr>
            <th>Subject</th>
            <th>Customer</th>
            <th>Status</th>
            <th>Priority</th>
            <th>Assigned To</th>
            <th>Created</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {tickets.map((t) => (
            <tr key={t.id}>
              <td>
                <Link href={`/support/${t.id}`} className="text-decoration-none fw-medium">
                  {t.subject}
                </Link>
              </td>
              <td className="text-muted">{t.customer_name ?? "—"}</td>
              <td>
                <span className={`badge ${STATUS_BADGES[t.status] ?? "bg-secondary"}`}>
                  {t.status.replace("_", " ")}
                </span>
              </td>
              <td>
                <span className={`badge ${PRIORITY_BADGES[t.priority] ?? "bg-secondary"}`}>
                  {t.priority}
                </span>
              </td>
              <td className="text-muted">{t.assigned_name ?? "—"}</td>
              <td className="text-muted small">
                {new Date(t.created_at).toLocaleDateString()}
              </td>
              <td>
                <Link
                  href={`/support/${t.id}`}
                  className="btn btn-sm btn-outline-primary"
                >
                  View
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
