"use client";

import { useState, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@iconify/react";
import { toast } from "react-toastify";
import { runServerAction } from "@/lib/run-server-action";
import { deleteOrder, generateInvoiceForOrder, bulkGenerateInvoices, type OrderListItem, type PaymentStatus } from "./actions";
import ClientDate from "@/components/ClientDate";

const STATUS_BADGES: Record<string, string> = {
  pending: "bg-warning text-dark",
  confirmed: "bg-info text-white",
  processing: "bg-primary text-white",
  out_for_delivery: "bg-secondary text-white",
  delivered: "bg-success text-white",
  cancelled: "bg-danger text-white",
  returned: "bg-dark text-white",
  return_requested: "bg-warning text-dark",
  return_processing: "bg-info text-white",
  return_approved: "bg-info text-white",
  return_rejected: "bg-dark text-white",
};

const PAYMENT_BADGES: Record<string, string> = {
  unpaid: "bg-warning text-dark",
  paid: "bg-success text-white",
  refunded: "bg-danger text-white",
  partially_refunded: "bg-info text-white",
};

type ActionPermissions = {
  canView: boolean; canCreate: boolean; canEdit: boolean; canDelete: boolean;
  canCreateInvoice?: boolean;
};

export default function OrdersClient({ orders, actionPerms }: { orders: OrderListItem[]; actionPerms?: ActionPermissions }) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  // P43: store filter. Built from the distinct stores in the data so
  // we don't need a separate `getStores` call. Empty string = "All
  // stores".
  const [storeFilter, setStoreFilter] = useState("");
  const [deleting, setDeleting] = useState<{ id: string; orderNumber: string } | null>(null);
  const [generating, setGenerating] = useState(false);
  const [bulkGenerating, setBulkGenerating] = useState(false);

  // P43: distinct list of stores present in the data, sorted by name.
  // Used to populate the store filter dropdown.
  const availableStores = useMemo(() => {
    const map = new Map<string, { id: string; name: string; code: string }>();
    for (const o of orders) {
      if (o.stores && o.store_id) {
        if (!map.has(o.store_id)) {
          map.set(o.store_id, { id: o.store_id, name: o.stores.name, code: o.stores.code });
        }
      }
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [orders]);

  const filtered = useMemo(() => {
    return orders.filter((o) => {
      if (search && !o.order_number.toLowerCase().includes(search.toLowerCase())) return false;
      if (statusFilter && o.status !== statusFilter) return false;
      if (storeFilter && o.store_id !== storeFilter) return false;
      return true;
    });
  }, [orders, search, statusFilter, storeFilter]);

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
        <div className="d-flex gap-2 flex-wrap">
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
          {/* P43: store filter. Only renders when there's ≥ 1 store in
              the data; for a Manager (store-scoped) the page already
              filters to their store at the action layer, so this
              dropdown would only show their one store. */}
          {availableStores.length > 0 && (
            <select
              className="form-select form-select-sm"
              style={{ width: 200 }}
              value={storeFilter}
              onChange={(e) => setStoreFilter(e.target.value)}
              aria-label="Filter by store"
            >
              <option value="">All stores</option>
              {availableStores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.code})
                </option>
              ))}
            </select>
          )}
          {actionPerms?.canCreateInvoice && (
            <button
              className="btn btn-sm btn-outline-warning"
              disabled={bulkGenerating}
              onClick={async () => {
                setBulkGenerating(true);
                const result = await runServerAction(bulkGenerateInvoices);
                setBulkGenerating(false);
                if (result.ok) {
                  const { generated, failed } = result.value;
                  if (generated > 0) {
                    toast.success(`Generated ${generated} invoice${generated !== 1 ? "s" : ""}`);
                  } else {
                    toast.info("No pending orders to generate");
                  }
                  if (failed.length > 0) {
                    toast.error(`${failed.length} failed`);
                  }
                } else {
                  toast.error(result.error.message);
                }
              }}
            >
              {bulkGenerating ? (
                <><Icon icon="ri:loader-4-line" className="spinner me-1" /> Generating...</>
              ) : (
                <><Icon icon="ri:file-list-3-line" className="me-1" /> Bulk Generate Invoices</>
              )}
            </button>
          )}
        </div>
      </div>
      <div className="table-responsive">
        <table className="table table-hover align-middle mb-0">
          <thead className="table-light">
            <tr>
              <th>Order #</th>
              {/* P43: new column showing which store the order belongs to. */}
              <th>Store</th>
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
                <td colSpan={8} className="text-center text-muted py-4">No orders found</td>
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
                <td>
                  {/* P43: store name + code. Renders "No store" for
                      legacy orders with no store_id. */}
                  {order.stores ? (
                    <span className="d-inline-flex align-items-center gap-1">
                      <span className="fw-medium">{order.stores.name}</span>
                      <code className="text-muted small">{order.stores.code}</code>
                    </span>
                  ) : (
                    <span className="text-muted">No store</span>
                  )}
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
                  <ClientDate
                    value={order.placed_at}
                    format="date"
                    dataTestid={`order-date-${order.id}`}
                  />
                </td>
                <td className="text-center" onClick={(e) => e.stopPropagation()}>
                  <div className="d-flex gap-1 justify-content-center">
                    {/* P56: download invoice button. Renders only when
                        the order has an invoice_id (auto-generated on
                        delivered, or pre-existing). Mirrors the
                        pattern used on /orders/[id] and
                        /cart/[cart_id] — direct link to the PDF API
                        route, target=_blank + download attribute so
                        the browser saves instead of navigating. The
                        user no longer needs to open the full order
                        detail to fetch the PDF. */}
                    {order.invoice_id && (
                      <a
                        href={`/api/invoices/${order.invoice_id}/pdf`}
                        target="_blank"
                        rel="noopener noreferrer"
                        download
                        className="btn btn-sm btn-outline-success"
                        title="Download invoice PDF"
                        data-testid={`order-row-download-invoice-${order.id}`}
                      >
                        <Icon icon="ri:download-2-line" width={16} />
                      </a>
                    )}
                    {/* Per-row Generate Invoice button. Shown only when
                        the order is delivered but has no invoice_id
                        (auto-generation may have failed). */}
                    {actionPerms?.canCreateInvoice && order.status === "delivered" && !order.invoice_id && (
                      <button
                        className="btn btn-sm btn-outline-warning"
                        title="Generate invoice"
                        onClick={async () => {
                          const result = await runServerAction(generateInvoiceForOrder, order.id);
                          if (result.ok) {
                            toast.success("Invoice generated");
                            router.refresh();
                          } else {
                            toast.error(result.error.message);
                          }
                        }}
                        data-testid={`order-row-generate-invoice-${order.id}`}
                      >
                        <Icon icon="ri:file-list-3-line" width={16} />
                      </button>
                    )}
                    {actionPerms?.canDelete && (
                      <button
                        className="btn btn-sm btn-outline-danger"
                        title="Delete"
                        onClick={() => setDeleting({ id: order.id, orderNumber: order.order_number })}
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
