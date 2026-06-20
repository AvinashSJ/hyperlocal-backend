"use client";

import { useState, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@iconify/react";
import { toast } from "react-toastify";
import { runServerAction } from "@/lib/run-server-action";
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
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [deleting, setDeleting] = useState<{ id: string; orderNumber: string } | null>(null);

  const filtered = useMemo(() => {
    return orders.filter((o) => {
      if (search && !o.order_number.toLowerCase().includes(search.toLowerCase())) return false;
      if (statusFilter && o.status !== statusFilter) return false;
      return true;
    });
  }, [orders, search, statusFilter]);

  const confirmDelete = useCallback(async () => {
    if (!deleting) return;
    const result = await runServerAction(deleteOrder, deleting.id);
    if (result.ok) {
      toast.success("Order deleted");
      setDeleting(null);
    } else {
      toast.error(result.error.message);
    }
  }, [deleting]);

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
              <tr
                key={order.id}
                onClick={() => router.push(`/orders/${order.id}`)}
                style={{ cursor: "pointer" }}
              >
                <td>
                  <span className="fw-semibold">{order.order_number}</span>
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
                <td className="text-center" onClick={(e) => e.stopPropagation()}>
                  {actionPerms?.canDelete && (
                    <button
                      className="btn btn-sm btn-outline-danger"
                      title="Delete"
                      onClick={() => setDeleting({ id: order.id, orderNumber: order.order_number })}
                    >
                      <Icon icon="ri:delete-bin-6-line" width={16} />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {deleting && (
        <div
          className="position-fixed top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center"
          style={{ background: "rgba(0,0,0,0.5)", zIndex: 1050 }}
        >
          <div className="bg-white rounded-3 shadow" style={{ width: 420 }}>
            <div className="px-4 py-3 border-bottom">
              <h6 className="fw-bold mb-0">Delete Order</h6>
            </div>
            <div className="p-4">
              <p className="mb-1">Are you sure you want to delete order <strong>{deleting.orderNumber}</strong>?</p>
              <p className="text-muted small mb-0">This action cannot be undone.</p>
            </div>
            <div className="d-flex justify-content-end gap-2 px-4 py-3 border-top">
              <button className="btn btn-outline-secondary" onClick={() => setDeleting(null)}>
                Cancel
              </button>
              <button className="btn btn-danger" onClick={confirmDelete}>
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
