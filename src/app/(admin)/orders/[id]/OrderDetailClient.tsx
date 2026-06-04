"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Icon } from "@iconify/react";
import { toast } from "react-toastify";
import { updateOrderStatus, updatePaymentStatus, type OrderDetail, type OrderStatus, type PaymentStatus } from "../actions";

const STATUS_BADGES: Record<string, string> = {
  pending: "bg-warning text-dark",
  confirmed: "bg-info text-white",
  processing: "bg-primary text-white",
  shipped: "bg-secondary text-white",
  delivered: "bg-success text-white",
  cancelled: "bg-danger text-white",
  returned: "bg-dark text-white",
};

const STATUS_FLOW: OrderStatus[] = ["pending", "confirmed", "processing", "shipped", "delivered"];
const CANCEL_STATUS: OrderStatus = "cancelled";
const RETURN_STATUS: OrderStatus = "returned";

export default function OrderDetailClient({ order }: { order: OrderDetail }) {
  const router = useRouter();
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [newStatus, setNewStatus] = useState<OrderStatus>(order.status);
  const [statusNotes, setStatusNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [newPaymentStatus, setNewPaymentStatus] = useState<PaymentStatus>(order.payment_status);
  const [savingPayment, setSavingPayment] = useState(false);

  const handleStatusUpdate = async () => {
    if (newStatus === order.status) return;
    setSaving(true);
    try {
      await updateOrderStatus(order.id, newStatus, statusNotes || undefined);
      toast.success(`Status updated to ${newStatus}`);
      setShowStatusModal(false);
      setStatusNotes("");
      router.refresh();
    } catch {
      toast.error("Failed to update status");
    } finally {
      setSaving(false);
    }
  };

  const handlePaymentUpdate = async () => {
    if (newPaymentStatus === order.payment_status) return;
    setSavingPayment(true);
    try {
      await updatePaymentStatus(order.id, newPaymentStatus);
      toast.success(`Payment status updated to ${newPaymentStatus}`);
      setShowPaymentModal(false);
      router.refresh();
    } catch {
      toast.error("Failed to update payment status");
    } finally {
      setSavingPayment(false);
    }
  };

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
        <div className="d-flex gap-2">
          {order.status !== "cancelled" && order.status !== "returned" && order.status !== "delivered" && (
            <button className="btn btn-primary btn-sm" onClick={() => setShowStatusModal(true)}>
              <Icon icon="ri:exchange-line" width={16} className="me-1" />Update Status
            </button>
          )}
          <button className="btn btn-outline-info btn-sm" onClick={() => setShowPaymentModal(true)}>
            <Icon icon="ri:money-dollar-circle-line" width={16} className="me-1" />Update Payment
          </button>
        </div>
      </div>

      <div className="row g-3">
        <div className="col-lg-4">
          <div className="card h-100">
            <div className="card-header"><strong>Order Info</strong></div>
            <div className="card-body">
              <table className="table table-sm mb-0">
                <tbody>
                  <tr><td className="text-muted" style={{ width: 120 }}>Order #</td><td className="fw-semibold">{order.order_number}</td></tr>
                  <tr><td className="text-muted">Placed At</td><td>{new Date(order.placed_at).toLocaleString("en-IN")}</td></tr>
                  <tr><td className="text-muted">Payment</td><td><span className={`badge ${order.payment_status === "paid" ? "bg-success" : "bg-warning text-dark"}`}>{order.payment_status}</span></td></tr>
                  <tr><td className="text-muted">Method</td><td>{order.payment_method ?? "—"}</td></tr>
                  <tr><td className="text-muted">Delivery</td><td>{order.delivery_date ? new Date(order.delivery_date).toLocaleDateString("en-IN") : "—"}</td></tr>
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
                        <td>{item.products?.name ?? "—"}</td>
                        <td>{item.product_variants?.name ?? "—"}</td>
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
                          {new Date(track.created_at).toLocaleString("en-IN")}
                        </div>
                        {track.notes && <div className="small mt-1">{track.notes}</div>}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {(order.status !== "cancelled" && order.status !== "returned" && order.status !== "delivered") && (
            <div className="mt-2">
              <Link href={`/invoices?order_id=${order.id}`} className="btn btn-sm btn-outline-success w-100">
                <Icon icon="ri:file-text-line" width={16} className="me-1" />View Invoice
              </Link>
            </div>
          )}
        </div>
      </div>

      {showStatusModal && (
        <div style={{
          position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.5)", zIndex: 1050,
          display: "flex", alignItems: "center", justifyContent: "center",
        }} onClick={() => setShowStatusModal(false)}>
          <div className="card" style={{ width: 420, maxWidth: "90vw" }} onClick={(e) => e.stopPropagation()}>
            <div className="card-header d-flex justify-content-between align-items-center">
              <strong>Update Order Status</strong>
              <button className="btn-close" onClick={() => setShowStatusModal(false)} />
            </div>
            <div className="card-body">
              <div className="mb-3">
                <label className="form-label">Current Status</label>
                <input type="text" className="form-control" value={order.status} disabled />
              </div>
              <div className="mb-3">
                <label className="form-label">New Status</label>
                <select className="form-select" value={newStatus} onChange={(e) => setNewStatus(e.target.value as OrderStatus)}>
                  {STATUS_FLOW.map((s) => {
                    const idx = STATUS_FLOW.indexOf(order.status as OrderStatus);
                    const newIdx = STATUS_FLOW.indexOf(s);
                    if (s === order.status) return null;
                    if (newIdx < idx && s !== "cancelled") return null;
                    return <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>;
                  })}
                  {order.status !== "cancelled" && order.status !== "returned" && (
                    <option value="cancelled">Cancel Order</option>
                  )}
                  {order.status === "delivered" && <option value="returned">Return</option>}
                </select>
              </div>
              <div className="mb-3">
                <label className="form-label">Notes (optional)</label>
                <textarea className="form-control" rows={3} value={statusNotes} onChange={(e) => setStatusNotes(e.target.value)} placeholder="Reason for status change..." />
              </div>
              <button className="btn btn-primary w-100" onClick={handleStatusUpdate} disabled={saving || newStatus === order.status}>
                {saving ? "Updating..." : `Update to ${newStatus}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {showPaymentModal && (
        <div style={{
          position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.5)", zIndex: 1050,
          display: "flex", alignItems: "center", justifyContent: "center",
        }} onClick={() => setShowPaymentModal(false)}>
          <div className="card" style={{ width: 400, maxWidth: "90vw" }} onClick={(e) => e.stopPropagation()}>
            <div className="card-header d-flex justify-content-between align-items-center">
              <strong>Update Payment Status</strong>
              <button className="btn-close" onClick={() => setShowPaymentModal(false)} />
            </div>
            <div className="card-body">
              <div className="mb-3">
                <label className="form-label">Payment Status</label>
                <select className="form-select" value={newPaymentStatus} onChange={(e) => setNewPaymentStatus(e.target.value as PaymentStatus)}>
                  {(["unpaid", "paid", "refunded", "partially_refunded"] as PaymentStatus[]).map((s) => (
                    <option key={s} value={s}>{s.replace("_", " ").replace(/\b\w/g, (c) => c.toUpperCase())}</option>
                  ))}
                </select>
              </div>
              <button className="btn btn-primary w-100" onClick={handlePaymentUpdate} disabled={savingPayment || newPaymentStatus === order.payment_status}>
                {savingPayment ? "Updating..." : "Update Payment"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
