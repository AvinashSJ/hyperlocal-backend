"use client";

import { useState, useMemo } from "react";
import { Icon } from "@iconify/react";
import Link from "next/link";
import type { CommissionPeriod } from "../../actions";
import type { ActionPermissions } from "@/lib/require-permission";
// P63: client-side date renderer. Avoids hydration mismatches caused
// by server/client timezone divergence in toLocaleDateString.
import ClientDate from "@/components/ClientDate";

const STATUS_BADGES: Record<string, string> = {
  unpaid: "bg-warning bg-opacity-10 text-warning",
  partially_paid: "bg-info bg-opacity-10 text-info",
  paid: "bg-success bg-opacity-10 text-success",
};

function formatStatus(s: string): string {
  return s.replace("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatPeriodLabel(start: string, end: string): string {
  // start = "2026-05-01", end = "2026-05-31" → "1-31 May 2026"
  const startDate = new Date(start + "T00:00:00");
  const endDate = new Date(end + "T00:00:00");
  const day1 = startDate.getDate();
  const day2 = endDate.getDate();
  const month = endDate.toLocaleString("en-IN", { month: "long" });
  const year = endDate.getFullYear();
  return `${day1}-${day2} ${month} ${year}`;
}

export default function StoreCommissionsClient({
  store,
  periods,
  actionPerms,
}: {
  store: { id: string; name: string; code: string; commission_rate: number | null };
  periods: CommissionPeriod[];
  actionPerms?: ActionPermissions;
}) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    if (!search) return periods;
    const q = search.toLowerCase();
    return periods.filter((p) => p.period_start.includes(q) || p.period_end.includes(q));
  }, [periods, search]);

  // Summary stats
  const totalCommission = periods.reduce((s, p) => s + p.commission_amount, 0);
  const totalPaid = periods.reduce((s, p) => s + p.paid_amount, 0);
  const totalBalance = Math.max(totalCommission - totalPaid, 0);

  return (
    <div>
      <div className="d-flex flex-wrap gap-2 align-items-center justify-content-between mb-3">
        <h5 className="mb-0">
          Commission Periods ({filtered.length})
        </h5>
        <input
          type="text"
          className="form-control form-control-sm"
          placeholder="Search by period (YYYY-MM)..."
          style={{ width: 240 }}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          data-testid="store-commissions-search"
        />
      </div>

      <div className="card border-0 bg-light mb-3" data-testid="store-commissions-summary">
        <div className="card-body py-2">
          <div className="d-flex flex-wrap gap-3 align-items-center small">
            <span>
              <span className="text-muted">Total:</span>{" "}
              <strong>₹{Math.round(totalCommission).toLocaleString()}</strong>
            </span>
            <span className="text-muted">·</span>
            <span>
              <span className="text-muted">Paid:</span>{" "}
              <strong className="text-success">₹{Math.round(totalPaid).toLocaleString()}</strong>
            </span>
            <span className="text-muted">·</span>
            <span>
              <span className="text-muted">Balance:</span>{" "}
              <strong className={totalBalance > 0 ? "text-danger" : "text-success"}>
                ₹{Math.round(totalBalance).toLocaleString()}
              </strong>
            </span>
          </div>
        </div>
      </div>

      <div className="table-responsive">
        <table className="table table-hover align-middle mb-0">
          <thead className="table-light">
            <tr>
              <th>Period</th>
              <th className="text-end">Revenue</th>
              <th className="text-center">Rate</th>
              <th className="text-end">Commission</th>
              <th className="text-end">Paid</th>
              <th className="text-end">Balance</th>
              <th className="text-center">Status</th>
              <th className="text-center">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="text-center text-muted py-4">
                  No commission periods yet
                </td>
              </tr>
            ) : (
              filtered.map((p) => (
                <tr key={p.id} data-testid={`store-commission-period-row-${p.id}`}>
                  <td>
                    <div className="fw-medium">{formatPeriodLabel(p.period_start, p.period_end)}</div>
                    <small className="text-muted">
                      <ClientDate value={p.period_start} format="date" /> – <ClientDate value={p.period_end} format="date" />
                    </small>
                  </td>
                  <td className="text-end">₹{p.total_revenue.toLocaleString()}</td>
                  <td className="text-center">{p.commission_rate}%</td>
                  <td className="text-end">₹{p.commission_amount.toLocaleString()}</td>
                  <td className="text-end text-success">₹{p.paid_amount.toLocaleString()}</td>
                  <td className="text-end fw-semibold">
                    <span className={p.balance_due > 0 ? "text-danger" : "text-success"}>
                      ₹{p.balance_due.toLocaleString()}
                    </span>
                  </td>
                  <td className="text-center">
                    <span className={`badge ${STATUS_BADGES[p.status] ?? "bg-secondary"}`}>
                      {formatStatus(p.status)}
                    </span>
                  </td>
                  <td className="text-center">
                    <Link
                      href={`/commissions/${p.id}`}
                      className="btn btn-sm btn-outline-primary"
                      title="View detail / record payment"
                      data-testid={`store-commission-view-${p.id}`}
                    >
                      <Icon icon="mdi:eye-outline" />
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <p className="text-muted small mt-2 mb-0">
        Revenue, commission, paid, and balance are all computed live from current paid orders. The current month is auto-created on first view of this page.
      </p>
    </div>
  );
}
