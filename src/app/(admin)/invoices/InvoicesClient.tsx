"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Icon } from "@iconify/react";
import type { InvoiceListItem } from "./actions";

export default function InvoicesClient({ invoices }: { invoices: InvoiceListItem[] }) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const filtered = useMemo(() => {
    return invoices.filter((inv) => {
      if (search && !inv.invoice_number.toLowerCase().includes(search.toLowerCase())) return false;
      if (statusFilter && inv.status !== statusFilter) return false;
      return true;
    });
  }, [invoices, search, statusFilter]);

  return (
    <>
      <div className="d-flex flex-wrap gap-2 align-items-center justify-content-between mb-3">
        <h5 className="mb-0">All Invoices ({filtered.length})</h5>
        <div className="d-flex gap-2">
          <input
            type="text"
            className="form-control form-control-sm"
            placeholder="Search invoice #..."
            style={{ width: 200 }}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select
            className="form-select form-select-sm"
            style={{ width: 150 }}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">All Statuses</option>
            <option value="generated">Generated</option>
            <option value="sent">Sent</option>
            <option value="paid">Paid</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
      </div>
      <div className="table-responsive">
        <table className="table table-hover align-middle mb-0">
          <thead className="table-light">
            <tr>
              <th>Invoice #</th>
              <th>Order #</th>
              <th>Customer</th>
              <th>Amount</th>
              <th>Status</th>
              <th>Date</th>
              <th className="text-center">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="text-center text-muted py-4">No invoices found</td>
              </tr>
            )}
            {filtered.map((inv) => (
              <tr key={inv.id}>
                <td className="fw-semibold">{inv.invoice_number}</td>
                <td>{inv.orders?.order_number ?? "—"}</td>
                <td>{inv.orders?.profiles?.full_name ?? "—"}</td>
                <td>₹{Number(inv.total_amount).toLocaleString()}</td>
                <td>
                  <span className={`badge ${inv.status === "generated" ? "bg-info" : inv.status === "sent" ? "bg-primary" : inv.status === "paid" ? "bg-success" : "bg-secondary"}`}>
                    {inv.status}
                  </span>
                </td>
                <td className="text-nowrap">
                  {new Date(inv.invoice_date).toLocaleDateString("en-IN", {
                    day: "numeric", month: "short", year: "numeric",
                  })}
                </td>
                <td className="text-center">
                  <Link
                    href={`/invoices/${inv.id}`}
                    className="btn btn-sm btn-outline-primary"
                    title="View Invoice"
                  >
                    <Icon icon="ri:file-text-line" width={16} />
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
