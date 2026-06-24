"use client";

import Link from "next/link";
import { Icon } from "@iconify/react";
import OrderActionControls from "../../orders/[id]/OrderActionControls";
import type { CartGroup, CartGroupOrder } from "./actions";

const STATUS_BADGES: Record<string, string> = {
  pending: "bg-warning text-dark",
  confirmed: "bg-info text-white",
  processing: "bg-primary text-white",
  shipped: "bg-secondary text-white",
  delivered: "bg-success text-white",
  cancelled: "bg-danger text-white",
  returned: "bg-dark text-white",
};

const fmtMoney = (n: number) => `₹${n.toLocaleString("en-IN")}`;

function SubOrderCard({ order }: { order: CartGroupOrder }) {
  return (
    <div className="card mb-3" data-testid={`cart-sub-order-${order.id}`}>
      <div className="card-header d-flex flex-wrap gap-2 align-items-center">
        <Icon icon="ri:store-2-line" className="text-muted" />
        {order.stores ? (
          <>
            <strong className="me-1">{order.stores.name}</strong>
            <code className="text-muted small">{order.stores.code}</code>
          </>
        ) : (
          <span className="text-muted">No store</span>
        )}
        <span className="text-muted small ms-2">·</span>
        <span className="text-muted small">order #{order.order_number}</span>
        <span
          className={`badge ms-auto ${STATUS_BADGES[order.status] ?? "bg-secondary"}`}
          data-testid={`sub-order-status-${order.id}`}
        >
          {order.status}
        </span>
      </div>
      <div className="card-body">
        {/* Status + payment summary row */}
        <div className="row g-2 small mb-3">
          <div className="col-6 col-md-3">
            <div className="text-muted">Payment</div>
            <span
              className={`badge ${
                order.payment_status === "paid" ? "bg-success" : "bg-warning text-dark"
              }`}
            >
              {order.payment_status}
            </span>
          </div>
          <div className="col-6 col-md-3">
            <div className="text-muted">Items</div>
            <div className="fw-semibold">{order.item_count}</div>
          </div>
          <div className="col-6 col-md-3">
            <div className="text-muted">Subtotal</div>
            <div className="fw-semibold">{fmtMoney(order.subtotal)}</div>
          </div>
          <div className="col-6 col-md-3">
            <div className="text-muted">Total</div>
            <div className="fw-bold">{fmtMoney(order.total_amount)}</div>
          </div>
        </div>

        {/* Action buttons: full inline edit per sub-order (per user request) */}
        <div className="d-flex flex-wrap gap-2 mb-3">
          <OrderActionControls
            orderId={order.id}
            currentStatus={order.status}
            currentPaymentStatus={order.payment_status}
          />
          <Link
            href={`/orders/${order.id}`}
            className="btn btn-outline-secondary btn-sm"
            data-testid={`view-order-${order.id}`}
          >
            <Icon icon="ri:external-link-line" width={14} className="me-1" />
            View Order
          </Link>
          {order.invoice_id && (
            <a
              href={`/api/invoices/${order.invoice_id}/pdf`}
              target="_blank"
              rel="noopener noreferrer"
              download
              className="btn btn-outline-success btn-sm"
              data-testid={`download-invoice-${order.id}`}
            >
              <Icon icon="ri:download-2-line" width={14} className="me-1" />
              Invoice PDF
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

export default function CartGroupClient({ cart }: { cart: CartGroup }) {
  const addr = cart.delivery_address;
  const placed = new Date(cart.placed_at).toLocaleString("en-IN", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div data-testid="cart-group-root">
      {/* Cart summary header */}
      <div className="card mb-3">
        <div className="card-body">
          <div className="row g-3">
            <div className="col-md-4">
              <div className="text-muted small">Customer</div>
              {cart.customer ? (
                <div>
                  <div className="fw-semibold">{cart.customer.full_name ?? "—"}</div>
                  <div className="small text-muted">
                    {cart.customer.phone ?? "—"}
                    {cart.customer.email ? ` · ${cart.customer.email}` : ""}
                  </div>
                </div>
              ) : (
                <div className="text-muted">No profile</div>
              )}
            </div>
            <div className="col-md-4">
              <div className="text-muted small">Delivery address</div>
              {addr ? (
                <div>
                  <div className="fw-semibold">{addr.full_name}</div>
                  <div className="small">{addr.phone}</div>
                  <div className="small">
                    {addr.address_line1}
                    {addr.address_line2 ? `, ${addr.address_line2}` : ""}
                    {addr.landmark ? `, ${addr.landmark}` : ""}
                    <br />
                    {addr.city}, {addr.state} — {addr.pincode}
                  </div>
                </div>
              ) : (
                <div className="text-muted">No address</div>
              )}
            </div>
            <div className="col-md-4">
              <div className="text-muted small">Delivery</div>
              <div>
                {cart.delivery_date
                  ? new Date(cart.delivery_date).toLocaleDateString("en-IN", {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                    })
                  : "—"}
              </div>
              <div className="text-muted small mt-1">Placed {placed}</div>
              <div className="text-muted small">
                Payment: {cart.payment_method ?? "—"}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Sub-order cards */}
      <h6 className="text-muted small mb-2">
        {cart.orders.length} order{cart.orders.length === 1 ? "" : "s"} in this cart
      </h6>
      {cart.orders.map((order) => (
        <SubOrderCard key={order.id} order={order} />
      ))}

      {/* Grand total */}
      <div className="card border-primary" data-testid="cart-grand-total">
        <div className="card-body d-flex flex-wrap gap-2 align-items-center">
          <Icon icon="ri:bank-card-line" className="text-primary" />
          <strong>Cart total</strong>
          <span className="text-muted small ms-2">(sum of all sub-orders)</span>
          <span className="ms-auto fs-4 fw-bold text-primary">
            {fmtMoney(cart.total)}
          </span>
        </div>
      </div>
    </div>
  );
}
