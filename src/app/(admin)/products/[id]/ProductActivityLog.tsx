import { Icon } from "@iconify/react";
import type { ActivityLogWithUser } from "@/lib/activity-log";

const ACTION_META: Record<string, { label: string; icon: string; color: string }> = {
  create: { label: "Created", icon: "ri:add-circle-line", color: "text-success" },
  update: { label: "Edited", icon: "ri:edit-line", color: "text-primary" },
  delete: { label: "Deleted", icon: "ri:delete-bin-line", color: "text-danger" },
  bulk_import: { label: "Bulk import", icon: "ri:upload-2-line", color: "text-info" },
};

const INDIAN_DATETIME = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

function actorName(profiles: { full_name: string | null }[] | null | undefined): string {
  return profiles?.[0]?.full_name ?? "—";
}

function summaryFor(entry: ActivityLogWithUser): string {
  const details = entry.details as Record<string, unknown> | null;
  if (!details) return "";
  switch (entry.action) {
    case "create":
      return details.name ? `Name: ${String(details.name)}` : "";
    case "update": {
      const fields = Array.isArray(details.fields_received)
        ? (details.fields_received as string[])
        : [];
      if (fields.length === 0) return "";
      const shown = fields.slice(0, 5).join(", ");
      const more = fields.length > 5 ? `, +${fields.length - 5} more` : "";
      return `Fields touched: ${shown}${more}`;
    }
    case "delete":
      return details.name ? `Name: ${String(details.name)}` : "";
    case "bulk_import":
      return `Imported: ${details.imported ?? 0} · Errors: ${details.errors ?? 0}`;
    default:
      return "";
  }
}

export default function ProductActivityLog({
  entries,
}: {
  entries: ActivityLogWithUser[];
}) {
  return (
    <div className="card mt-4" data-testid="product-activity-log">
      <div className="card-body">
        <h6 className="fw-bold mb-3">Activity Log</h6>
        {entries.length === 0 ? (
          <p className="text-muted small mb-0" data-testid="activity-log-empty">
            No activity recorded yet.
          </p>
        ) : (
          <ul
            className="list-unstyled mb-0"
            style={{ maxHeight: 320, overflowY: "auto" }}
            data-testid="activity-log-list"
          >
            {entries.map((e) => {
              const meta = ACTION_META[e.action] ?? {
                label: e.action,
                icon: "ri:circle-line",
                color: "text-secondary",
              };
              return (
                <li
                  key={e.id}
                  className="d-flex gap-2 align-items-start py-2 border-bottom"
                  style={{ fontSize: "0.875rem" }}
                  data-testid="activity-log-entry"
                >
                  <Icon
                    icon={meta.icon}
                    className={`${meta.color} flex-shrink-0 mt-1`}
                    style={{ fontSize: "1.1rem" }}
                  />
                  <div className="flex-grow-1">
                    <div>
                      <strong>{actorName(e.profiles)}</strong>{" "}
                      <span className={meta.color}>{meta.label}</span>
                    </div>
                    {summaryFor(e) && (
                      <div className="text-muted small">{summaryFor(e)}</div>
                    )}
                    <div className="text-muted" style={{ fontSize: "0.75rem" }}>
                      {INDIAN_DATETIME.format(new Date(e.created_at))}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
