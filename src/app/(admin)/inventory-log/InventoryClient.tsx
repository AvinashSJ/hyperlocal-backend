"use client";

import { type getInventoryLogs } from "./actions";

type Log = Awaited<ReturnType<typeof getInventoryLogs>>[number];

export default function InventoryClient({ logs }: { logs: Log[] }) {
  return (
    <>
      <div className="d-flex flex-wrap gap-2 align-items-center justify-content-between mb-3">
        <h5 className="mb-0">Inventory Audit Trail ({logs.length})</h5>
      </div>
      <div className="table-responsive">
        <table className="table table-hover align-middle mb-0">
          <thead className="table-light">
            <tr>
              <th>Product</th>
              <th>Variant</th>
              <th>Qty Change</th>
              <th>Running Balance</th>
              <th>Reason</th>
              <th>Notes</th>
              <th>Adjusted By</th>
              <th>Date</th>
            </tr>
          </thead>
          <tbody>
            {logs.length === 0 && (
              <tr>
                <td colSpan={8} className="text-center text-muted py-4">No inventory log entries yet</td>
              </tr>
            )}
            {logs.map((log) => (
              <tr key={log.id}>
                <td className="fw-semibold">{log.products?.name ?? "—"}</td>
                <td>{log.variants?.name ?? "—"}</td>
                <td>
                  <span className={`fw-semibold ${Number(log.quantity_change) >= 0 ? "text-success" : "text-danger"}`}>
                    {Number(log.quantity_change) >= 0 ? "+" : ""}{log.quantity_change}
                  </span>
                </td>
                <td>{log.running_balance}</td>
                <td><span className="badge bg-info">{log.reason_code}</span></td>
                <td style={{ maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {log.notes || "—"}
                </td>
                <td style={{ fontFamily: "monospace", fontSize: "0.85em" }}>{log.adjusted_by ? log.adjusted_by.slice(0, 8) + "…" : "—"}</td>
                <td>{log.created_at ? new Date(log.created_at).toLocaleString() : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
