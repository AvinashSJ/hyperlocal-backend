"use client";

import { useState, useMemo } from "react";
import { Icon } from "@iconify/react";
import Link from "next/link";
import type { CommissionStoreSummary } from "./actions";
import type { ActionPermissions } from "@/lib/require-permission";
// P63: client-side date renderer. Avoids hydration mismatches caused
// by server/client timezone divergence in toLocaleDateString.
import ClientDate from "@/components/ClientDate";

export default function CommissionsClient({
  stores,
  actionPerms,
}: {
  stores: CommissionStoreSummary[];
  actionPerms?: ActionPermissions;
}) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    if (!search) return stores;
    const q = search.toLowerCase();
    return stores.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.code.toLowerCase().includes(q),
    );
  }, [stores, search]);

  return (
    <div>
      <div className="d-flex flex-wrap gap-2 align-items-center justify-content-between mb-3">
        <h5 className="mb-0">
          Stores ({filtered.length})
        </h5>
        <input
          type="text"
          className="form-control form-control-sm"
          placeholder="Search by name or code..."
          style={{ width: 280 }}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          data-testid="commissions-search"
        />
      </div>

      <div className="table-responsive">
        <table className="table table-hover align-middle mb-0">
          <thead className="table-light">
            <tr>
              <th>Store</th>
              <th className="text-center">Rate</th>
              <th className="text-center">Periods</th>
              <th className="text-end">Total Commission</th>
              <th className="text-end">Paid</th>
              <th className="text-end">Balance</th>
              <th>Last Period</th>
              <th className="text-center">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="text-center text-muted py-4">
                  No stores found
                </td>
              </tr>
            ) : (
              filtered.map((s) => (
                <tr key={s.id} data-testid={`commission-store-row-${s.id}`}>
                  <td>
                    <div className="fw-medium">{s.name}</div>
                    <code className="text-muted small">{s.code}</code>
                  </td>
                  <td className="text-center">{s.commission_rate}%</td>
                  <td className="text-center">
                    <span className="badge bg-primary bg-opacity-10 text-primary">
                      {s.period_count}
                    </span>
                  </td>
                  <td className="text-end">₹{s.total_commission.toLocaleString()}</td>
                  <td className="text-end text-success">
                    ₹{s.total_paid.toLocaleString()}
                  </td>
                  <td className="text-end fw-semibold">
                    <span className={s.total_balance > 0 ? "text-danger" : "text-success"}>
                      ₹{s.total_balance.toLocaleString()}
                    </span>
                  </td>
                  <td style={{ fontSize: "0.85rem", whiteSpace: "nowrap" }}>
                    {s.last_period_end ? (
                      <ClientDate value={s.last_period_end} format="date" />
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                  <td className="text-center">
                    <Link
                      href={`/commissions/store/${s.id}`}
                      className="btn btn-sm btn-outline-primary"
                      title="View commission periods"
                      data-testid={`commission-store-view-${s.id}`}
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

      {actionPerms?.canView && (
        <p className="text-muted small mt-2 mb-0">
          All amounts are computed live from current paid orders. Click a store to see per-period breakdown.
        </p>
      )}
    </div>
  );
}
