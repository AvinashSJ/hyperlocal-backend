"use client";

import { useState, useCallback } from "react";
import { Icon } from "@iconify/react";
import { toast } from "react-toastify";
import { deleteNotification, type getNotifications } from "./actions";
import NotificationForm from "./NotificationForm";

type Notification = Awaited<ReturnType<typeof getNotifications>>[number];

function formatDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

const TYPE_BADGES: Record<string, string> = {
  order: "bg-primary",
  promo: "bg-warning text-dark",
  alert: "bg-danger",
  info: "bg-info text-dark",
};

export default function NotificationsClient({ notifications: initial, canSend, canDelete }: { notifications: Notification[]; canSend?: boolean; canDelete?: boolean }) {
  const [notifications, setNotifications] = useState(initial);
  const [showForm, setShowForm] = useState(false);

  const handleDelete = useCallback(async (id: string) => {
    if (!confirm("Delete this notification?")) return;
    try {
      await deleteNotification(id);
      setNotifications((prev) => prev.filter((n) => n.id !== id));
      toast.success("Notification deleted");
    } catch {
      toast.error("Failed to delete notification");
    }
  }, []);

  return (
    <>
      <div className="d-flex flex-wrap gap-2 align-items-center justify-content-between mb-3">
        <h5 className="mb-0">All Notifications ({notifications.length})</h5>
        {canSend && (
          <button className="btn btn-primary btn-sm" onClick={() => setShowForm(true)}>
            <Icon icon="ri:send-plane-line" width={16} className="me-1" />Send Notification
          </button>
        )}
      </div>
      <div className="table-responsive">
        <table className="table table-hover align-middle mb-0">
          <thead className="table-light">
            <tr>
              <th>Title</th>
              <th>Body</th>
              <th>Type</th>
              <th>User</th>
              <th>Status</th>
              <th>Date</th>
              <th className="text-center">Actions</th>
            </tr>
          </thead>
          <tbody>
            {notifications.length === 0 && (
              <tr>
                <td colSpan={7} className="text-center text-muted py-4">No notifications yet</td>
              </tr>
            )}
            {notifications.map((n) => (
              <tr key={n.id}>
                <td className="fw-semibold">{n.title}</td>
                <td style={{ maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {n.body || "—"}
                </td>
                <td>
                  <span className={`badge ${TYPE_BADGES[n.type] ?? "bg-secondary"}`}>
                    {n.type || "—"}
                  </span>
                </td>
                <td>
                  {n.profiles ? (
                    <span title={n.profiles.email ?? ""}>
                      {n.profiles.full_name ?? n.profiles.email ?? "—"}
                    </span>
                  ) : (
                    <span className="text-muted small">{n.user_id.slice(0, 8)}...</span>
                  )}
                </td>
                <td>
                  <span className={`badge ${n.is_read ? "bg-light text-muted" : "bg-success"}`}>
                    {n.is_read ? "Read" : "Unread"}
                  </span>
                </td>
                <td className="small text-muted">{formatDate(n.created_at)}</td>
                <td className="text-center">
                  {canDelete && (
                    <button className="btn btn-sm btn-outline-danger" title="Delete" onClick={() => handleDelete(n.id)}>
                      <Icon icon="ri:delete-bin-6-line" width={16} />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showForm && <NotificationForm onClose={() => setShowForm(false)} />}
    </>
  );
}
