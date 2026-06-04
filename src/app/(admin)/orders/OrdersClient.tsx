"use client";

import { useState, useMemo, useCallback } from "react";
import Link from "next/link";
import { Icon } from "@iconify/react";
import { toast } from "react-toastify";
import { deleteOrder, type OrderListItem, type PaymentStatus } from "./actions";

const STATUS_BADGES: Record<string, string> = {
  pending: "bg-warning text-dark",
  confirmed: "bg-info text-white",
  processing: "bg-primary text-white",
  shipped: "bg-secondary text-white",
  delivered: "bg-success text-white",
  cancelled: "bg-danger text-white",
  returned: "bg-dark text-white",
};

const PAYMENT_BADGES: Record<string, string> = {
  unpaid: "bg-warning text-dark",
  paid: "bg-success text-white",
  refunded: "bg-danger text-white",
  partially_refunded: "bg-info text-white",
};

type ActionPermissions = {
  canView: boolean; canCreate: boolean; canEdit: boolean; canDelete: boolean;
};

export default function OrdersClient({ orders, actionPerms }: { orders: OrderListItem[]; actionPerms?: ActionPermissions }) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const filtered = useMemo(() => {
    return orders.filter((o) => {
      if (search && !o.order_number.toLowerCase().includes(search.toLowerCase())) return false;
      if (statusFilter && o.status !== statusFilter) return false;
      return true;
    });
  }, [orders, search, statusFilter]);

  const handleDelete = useCallback(async (id: string, orderNumber: string) => {
    if (!confirm(`Delete order ${orderNumber}?`)) return;
    try {
      await deleteOrder(id);
      toast.success("Order deleted");
    } catch {
      toast.error("Failed to delete order");
    }
  }, []);

  return (
    <>
      <div className="d-flex flex-wrap gap-2 align-items-center justify-content-between mb-3">
        <h5 className="mb-0">All Orders ({filtered.length})</h5>
        <div className="d-flex gap-2">
          <input
            type="text"
            className="form-control form-control-sm"
            placeholder="Search by order #..."
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
            {Object.keys(STATUS_BADGES).map((s) => (
              <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="table-responsive">
        <table className="table table-hover align-middle mb-0">
          <thead className="table-light">
            <tr>
              <th>Order #</th>
              <th>Customer</th>
              <th>Amount</th>
              <th>Payment</th>
              <th>Status</th>
              <th>Date</th>
              <th className="text-center">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="text-center text-muted py-4">No orders found</td>
              </tr>
            )}
            {filtered.map((order) => (
              <tr key={order.id}>
                <td>
                  <Link href={`/orders/${order.id}`} className="fw-semibold text-decoration-none">
                    {order.order_number}
                  </Link>
                </td>
                <td>{order.profiles?.full_name ?? "—"}</td>
                <td>₹{Number(order.total_amount).toLocaleString()}</td>
                <td>
                  <span className={`badge ${PAYMENT_BADGES[order.payment_status] ?? "bg-secondary"}`}>
                    {order.payment_status}
                  </span>
                </td>
                <td>
                  <span className={`badge ${STATUS_BADGES[order.status] ?? "bg-secondary"}`}>
                    {order.status}
                  </span>
                </td>
                <td className="text-nowrap">
                  {new Date(order.placed_at).toLocaleDateString("en-IN", {
                    day: "numeric", month: "short", year: "numeric",
                  })}
                </td>
                <td className="text-center">
                  <div className="d-flex gap-1 justify-content-center">
                    <Link
                      href={`/orders/${order.id}`}
                      className="btn btn-sm btn-outline-primary"
                      title="View"
                    >
                      <Icon icon="ri:eye-line" width={16} />
                    </Link>
                    {actionPerms?.canDelete && (
                      <button
                        className="btn btn-sm btn-outline-danger"
                        title="Delete"
                        onClick={() => handleDelete(order.id, order.order_number)}
                      >
                        <Icon icon="ri:delete-bin-6-line" width={16} />
                      </button>
                    )}
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
