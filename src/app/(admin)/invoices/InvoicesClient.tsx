"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Icon } from "@iconify/react";
import type { InvoiceListItem } from "./actions";
// P63: client-side date renderer. Avoids hydration mismatches caused
// by server/client timezone divergence in toLocaleDateString.
import ClientDate from "@/components/ClientDate";

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
              {/* P43: new column showing which store the invoice belongs to. */}
              <th>Store</th>
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
                <td colSpan={8} className="text-center text-muted py-4">No invoices found</td>
              </tr>
            )}
            {filtered.map((inv) => (
              <tr key={inv.id}>
                <td className="fw-semibold">{inv.invoice_number}</td>
                <td>
                  {/* P43: store name + code. Renders "No store" for
                      legacy invoices whose order has no store_id. */}
                  {inv.orders?.stores ? (
                    <span className="d-inline-flex align-items-center gap-1">
                      <span className="fw-medium">{inv.orders.stores.name}</span>
                      <code className="text-muted small">{inv.orders.stores.code}</code>
                    </span>
                  ) : (
                    <span className="text-muted">No store</span>
                  )}
                </td>
                <td>{inv.orders?.order_number ?? "—"}</td>
                <td>{inv.orders?.profiles?.full_name ?? "—"}</td>
                <td>₹{Number(inv.total_amount).toLocaleString()}</td>
                <td>
                  <span className={`badge ${inv.status === "generated" ? "bg-info" : inv.status === "sent" ? "bg-primary" : inv.status === "paid" ? "bg-success" : "bg-secondary"}`}>
                    {inv.status}
                  </span>
                </td>
                <td className="text-nowrap">
                  <ClientDate value={inv.invoice_date} format="date" />
                </td>
                <td className="text-center">
                  <div className="btn-group btn-group-sm" role="group">
                    <Link
                      href={`/invoices/${inv.id}`}
                      className="btn btn-outline-primary"
                      title="View Invoice"
                    >
                      <Icon icon="ri:file-text-line" width={16} />
                    </Link>
                    <a
                      href={`/api/invoices/${inv.id}/pdf`}
                      className="btn btn-outline-success"
                      title="Download Invoice PDF"
                      data-testid="row-download-invoice"
                    >
                      <Icon icon="ri:download-2-line" width={16} />
                    </a>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
