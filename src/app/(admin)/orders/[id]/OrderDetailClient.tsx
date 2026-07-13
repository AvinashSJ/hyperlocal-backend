"use client";

import Link from "next/link";
import { Icon } from "@iconify/react";
import { type OrderDetail } from "../actions";
import OrderActionControls from "./OrderActionControls";
// P62: return requests panel. Sits below the Items/Timeline row,
// above the Invoice card. Renders only when the order is in an
// eligible state (delivered, or any of the return_* statuses).
// Self-contained: fetches its own data, owns its modals, talks
// to the returns/ server actions directly.
import ReturnRequestsPanel from "./ReturnRequestsPanel";
// P63: client-side date renderer. Avoids hydration mismatches caused
// by server/client timezone divergence in toLocaleDateString.
import ClientDate from "@/components/ClientDate";
import type { ActivityLogWithUser } from "@/lib/activity-log";

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

type ActionPermissions = {
  canView: boolean; canCreate: boolean; canEdit: boolean; canDelete: boolean;
};

export default function OrderDetailClient({
  order,
  canCreateInvoice,
  returnsActionPerms,
  activityLog,
}: {
  order: OrderDetail;
  canCreateInvoice: boolean;
  returnsActionPerms: ActionPermissions;
  activityLog?: ActivityLogWithUser[];
}) {
  const addr = order.addresses;
  const profile = order.profiles;

  return (
    <>
      <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-4">
        <div className="d-flex align-items-center gap-3">
          <Link href="/orders" className="btn btn-sm btn-outline-secondary">
            <Icon icon="ri:arrow-left-line" width={18} />
          </Link>
          <h4 className="fw-bold mb-0">Order #{order.order_number}</h4>
          <span className={`badge fs-6 ${STATUS_BADGES[order.status] ?? "bg-secondary"}`}>{order.status}</span>
        </div>
        <OrderActionControls
          orderId={order.id}
          currentStatus={order.status}
          currentPaymentStatus={order.payment_status}
          currentInvoiceId={order.invoice_id}
          canCreateInvoice={canCreateInvoice ?? false}
        />
      </div>

      <div className="row g-3">
        <div className="col-lg-4">
          <div className="card h-100">
            <div className="card-header"><strong>Order Info</strong></div>
            <div className="card-body">
              <table className="table table-sm mb-0">
                <tbody>
                  <tr><td className="text-muted" style={{ width: 120 }}>Order #</td><td className="fw-semibold">{order.order_number}</td></tr>
                  {/* P43: store this order belongs to. Renders "No store"
                      for legacy orders (store_id NULL). */}
                  <tr>
                    <td className="text-muted">Store</td>
                    <td>
                      {order.stores ? (
                        <span className="d-inline-flex align-items-center gap-1">
                          <span className="fw-semibold">{order.stores.name}</span>
                          <code className="text-muted small">{order.stores.code}</code>
                        </span>
                      ) : (
                        <span className="text-muted">No store</span>
                      )}
                    </td>
                  </tr>
                  <tr><td className="text-muted">Placed At</td><td><ClientDate value={order.placed_at} format="datetime" /></td></tr>
                  <tr><td className="text-muted">Payment</td><td><span className={`badge ${order.payment_status === "paid" ? "bg-success" : "bg-warning text-dark"}`}>{order.payment_status}</span></td></tr>
                  <tr><td className="text-muted">Method</td><td>{order.payment_method ?? "—"}</td></tr>
                  <tr><td className="text-muted">Delivery</td><td><ClientDate value={order.delivery_date} format="date" fallback="—" /></td></tr>
                  <tr><td className="text-muted">GSTIN</td><td>{order.gstin ?? "—"}</td></tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="col-lg-4">
          <div className="card h-100">
            <div className="card-header"><strong>Customer</strong></div>
            <div className="card-body">
              {profile ? (
                <table className="table table-sm mb-0">
                  <tbody>
                    <tr><td className="text-muted" style={{ width: 80 }}>Name</td><td className="fw-semibold">{profile.full_name}</td></tr>
                    <tr><td className="text-muted">Phone</td><td>{profile.phone ?? "—"}</td></tr>
                    <tr><td className="text-muted">Email</td><td>{profile.email ?? "—"}</td></tr>
                  </tbody>
                </table>
              ) : <p className="text-muted mb-0">No profile data</p>}
            </div>
          </div>
        </div>

        <div className="col-lg-4">
          <div className="card h-100">
            <div className="card-header"><strong>Delivery Address</strong></div>
            <div className="card-body">
              {addr ? (
                <div>
                  <p className="mb-1 fw-semibold">{addr.full_name}</p>
                  <p className="mb-1">{addr.phone}</p>
                  <p className="mb-0">
                    {addr.address_line1}{addr.address_line2 ? `, ${addr.address_line2}` : ""}
                    {addr.landmark ? `, ${addr.landmark}` : ""}
                    <br />{addr.city}, {addr.state} — {addr.pincode}
                  </p>
                </div>
              ) : <p className="text-muted mb-0">No address</p>}
            </div>
          </div>
        </div>
      </div>

      <div className="row g-3 mt-2">
        <div className="col-lg-8">
          <div className="card">
            <div className="card-header"><strong>Items ({order.order_items.length})</strong></div>
            <div className="card-body p-0">
              <div className="table-responsive">
                <table className="table table-hover mb-0 align-middle">
                  <thead className="table-light">
                    <tr>
                      <th>Product</th>
                      <th>Variant</th>
                      <th className="text-center">Qty</th>
                      <th className="text-end">Unit Price</th>
                      <th className="text-end">GST</th>
                      <th className="text-end">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {order.order_items.map((item) => (
                      <tr key={item.id}>
                        {/* P26: prefer the snapshot (survives product/variant deletion),
                            fall back to the JOIN, then to "Deleted Product" if both are null
                            (legacy rows where the product was already deleted before the migration). */}
                        <td>{item.product_name ?? item.products?.name ?? "Deleted Product"}</td>
                        <td>{item.variant_name ?? item.product_variants?.name ?? "—"}</td>
                        <td className="text-center">{item.quantity}</td>
                        <td className="text-end">₹{Number(item.unit_price).toLocaleString()}</td>
                        <td className="text-end">
                          {item.gst_rate > 0 ? `${item.gst_rate}% (₹${Number(item.gst_amount).toLocaleString()})` : "—"}
                        </td>
                        <td className="text-end fw-semibold">₹{Number(item.total_price).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="table-light">
                    <tr>
                      <td colSpan={4}></td>
                      <td className="text-end fw-semibold">Subtotal</td>
                      <td className="text-end">₹{Number(order.subtotal).toLocaleString()}</td>
                    </tr>
                    {Number(order.discount_amount) > 0 && (
                      <tr>
                        <td colSpan={4}></td>
                        <td className="text-end fw-semibold">Discount</td>
                        <td className="text-end text-danger">-₹{Number(order.discount_amount).toLocaleString()}</td>
                      </tr>
                    )}
                    {Number(order.tax_amount) > 0 && (
                      <tr>
                        <td colSpan={4}></td>
                        <td className="text-end fw-semibold">Tax</td>
                        <td className="text-end">₹{Number(order.tax_amount).toLocaleString()}</td>
                      </tr>
                    )}
                    {Number(order.delivery_charge) > 0 && (
                      <tr>
                        <td colSpan={4}></td>
                        <td className="text-end fw-semibold">Delivery</td>
                        <td className="text-end">₹{Number(order.delivery_charge).toLocaleString()}</td>
                      </tr>
                    )}
                    <tr>
                      <td colSpan={4}></td>
                      <td className="text-end fw-bold">Total</td>
                      <td className="text-end fw-bold fs-5">₹{Number(order.total_amount).toLocaleString()}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </div>
        </div>

        <div className="col-lg-4">
          <div className="card">
            <div className="card-header"><strong>Order Timeline</strong></div>
            <div className="card-body" style={{ maxHeight: 400, overflowY: "auto" }}>
              {order.order_tracks.length === 0 ? (
                <p className="text-muted mb-0">No status updates yet</p>
              ) : (
                <ul className="list-unstyled mb-0" style={{ position: "relative" }}>
                  {order.order_tracks.map((track, i) => (
                    <li key={track.id} className="d-flex gap-3 pb-3" style={{ position: "relative" }}>
                      {i < order.order_tracks.length - 1 && (
                        <div style={{
                          position: "absolute", left: 7, top: 20, bottom: 0, width: 2,
                          backgroundColor: "#dee2e6",
                        }} />
                      )}
                      <div style={{
                        width: 16, height: 16, borderRadius: "50%", flexShrink: 0, marginTop: 3,
                        backgroundColor: track.status === "delivered" ? "#198754" :
                          track.status === "cancelled" ? "#dc3545" : "#6c757d",
                      }} />
                      <div>
                        <span className={`badge ${STATUS_BADGES[track.status] ?? "bg-secondary"} mb-1`}>
                          {track.status}
                        </span>
                        <div className="text-muted small">
                          <ClientDate value={track.created_at} format="datetime" />
                        </div>
                        {track.notes && <div className="small mt-1">{track.notes}</div>}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* P62: return requests panel. Renders below the
              Items/Timeline row, above the Invoice card. The panel
              itself hides when the order is in a non-eligible state
              (e.g., pending, confirmed, processing, shipped —
              nothing to return yet). The same `actionPerms` map
              used by OrderActionControls is forwarded so the panel's
              Manager actions (Approve / Reject / Mark fulfilled)
              are gated by `returns:edit` and the Hard Delete button
              by `returns:delete`. */}
          <ReturnRequestsPanel order={order} actionPerms={returnsActionPerms} />

          {/* P44: prominent Invoice card. Replaces the small inline
              buttons that used to live here. Visible whenever the
              order has an invoice_id (auto-generated on delivery
              or pre-existing). The Download button is the primary
              action — opens the PDF in a new tab with the
              `download` attribute so the browser saves it
              instead of navigating away. */}
          {order.invoice_id && (
            <div className="card mt-2 border-success">
              <div className="card-header bg-success-subtle text-success d-flex align-items-center gap-2">
                <Icon icon="ri:file-text-line" width={18} />
                <strong>Invoice</strong>
              </div>
              <div className="card-body">
                <div className="mb-2 small text-muted">
                  Invoice generated for this order.
                </div>
                <div className="d-grid gap-2">
                  <a
                    href={`/api/invoices/${order.invoice_id}/pdf`}
                    target="_blank"
                    rel="noopener noreferrer"
                    download
                    className="btn btn-success"
                    title="Download Invoice PDF"
                    data-testid="order-detail-download-invoice"
                  >
                    <Icon icon="ri:download-2-line" width={16} className="me-2" />
                    Download PDF
                  </a>
                  <Link
                    href={`/invoices/${order.invoice_id}`}
                    className="btn btn-outline-secondary btn-sm"
                  >
                    <Icon icon="ri:external-link-line" width={14} className="me-1" />
                    View Invoice Details
                  </Link>
                </div>
              </div>
            </div>
          )}

          {activityLog && activityLog.length > 0 && (
            <div className="card mt-2">
              <div className="card-header"><strong>Order Activity Log</strong></div>
              <div className="card-body" style={{ maxHeight: 320, overflowY: "auto" }}>
                {activityLog.map((e) => {
                  const details = (e.details ?? {}) as Record<string, unknown>;
                  const actionLabel = details.action_type
                    ? String(details.action_type).replace("status_", "")
                    : e.action;
                  return (
                    <div key={e.id} className="d-flex gap-2 align-items-start py-2 border-bottom" style={{ fontSize: "0.875rem" }}>
                      <div style={{ width: 16, height: 16, borderRadius: "50%", flexShrink: 0, marginTop: 3,
                        backgroundColor: actionLabel === "cancelled" ? "#dc3545" :
                          actionLabel === "returned" ? "#212529" : "#0d6efd",
                      }} />
                      <div className="flex-grow-1">
                        <div>
                          <strong>{e.profiles?.full_name ?? "—"}</strong>{" "}
                          <span className="text-primary">changed status to</span>{" "}
                          <span className={`badge ${STATUS_BADGES[actionLabel] ?? "bg-secondary"} text-capitalize`}>
                            {actionLabel}
                          </span>
                        </div>
                        {String(details.notes ?? "") && <div className="text-muted small mt-1">{String(details.notes)}</div>}
                        <div className="text-muted" style={{ fontSize: "0.75rem" }}>
                          <ClientDate value={e.created_at} format="datetime" />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

