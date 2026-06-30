"use client";

import Link from "next/link";
import { Icon } from "@iconify/react";
import type { StoreRow } from "../actions";
import type { StoreRelations } from "../actions";
// P63: client-side date renderer. Avoids hydration mismatches caused
// by server/client timezone divergence in toLocaleString.
import ClientDate from "@/components/ClientDate";

type ActionPermissions = {
  canView: boolean; canCreate: boolean; canEdit: boolean; canDelete: boolean;
};

export default function StoreDetailClient({
  store,
  relations,
  actionPerms,
}: {
  store: StoreRow;
  relations: StoreRelations;
  actionPerms?: ActionPermissions;
}) {
  const fmtMoney = (n: number) => `₹${n.toLocaleString("en-IN")}`;

  return (
    <div data-testid="store-detail-root">
      {/* Header card: logo + name + status badges + actions */}
      <div className="card mb-3">
        <div className="card-body d-flex flex-wrap gap-3 align-items-center">
          {store.logo_url ? (
            <img
              src={store.logo_url}
              alt="Logo"
              className="border rounded"
              style={{ width: 72, height: 72, objectFit: "cover" }}
              data-testid="store-logo"
            />
          ) : (
            <div
              className="border rounded bg-light d-flex align-items-center justify-content-center text-muted"
              style={{ width: 72, height: 72 }}
            >
              <Icon icon="ri:store-2-line" style={{ fontSize: 32 }} />
            </div>
          )}
          <div className="flex-grow-1">
            <h4 className="mb-1" data-testid="store-name">{store.name}</h4>
            <div className="text-muted small">
              <code>{store.slug}</code>
              {store.code && (
                <>
                  {" · "}
                  <span className="badge bg-secondary bg-opacity-10 text-secondary" data-testid="store-code">
                    {store.code}
                  </span>
                </>
              )}
            </div>
            <div className="mt-2 d-flex flex-wrap gap-2">
              <span className={`badge ${store.is_active ? "bg-success" : "bg-secondary"}`}>
                {store.is_active ? "Active" : "Inactive"}
              </span>
              <span className={`badge ${store.is_open ? "bg-info" : "bg-secondary"}`}>
                {store.is_open ? "Open" : "Closed"}
              </span>
              {store.phone && (
                <span className="badge bg-light text-dark border">
                  <Icon icon="ri:phone-line" className="me-1" />
                  {store.phone}
                </span>
              )}
            </div>
          </div>
          <div className="d-flex gap-2">
            {actionPerms?.canEdit && (
              <Link
                href={`/settings?store_id=${store.id}`}
                className="btn btn-outline-primary btn-sm"
                data-testid="edit-store-btn"
              >
                <Icon icon="ri:pencil-line" className="me-1" />
                Edit Store
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* 4 summary stat cards */}
      <div className="row g-2 mb-3" data-testid="store-detail-stats">
        <div className="col-6 col-md-3">
          <div className="card border-0 bg-light h-100">
            <div className="card-body text-center p-2">
              <Icon icon="ri:shopping-cart-2-line" className="text-muted" style={{ fontSize: 20 }} />
              <div className="fw-bold fs-4 mt-1" data-testid="stat-orders">
                {relations.orderCount.toLocaleString()}
              </div>
              <div className="text-muted small">Orders</div>
            </div>
          </div>
        </div>
        <div className="col-6 col-md-3">
          <div className="card border-0 bg-light h-100">
            <div className="card-body text-center p-2">
              <Icon icon="ri:user-line" className="text-muted" style={{ fontSize: 20 }} />
              <div className="fw-bold fs-4 mt-1" data-testid="stat-customers">
                {relations.customerCount.toLocaleString()}
              </div>
              <div className="text-muted small">Customers</div>
            </div>
          </div>
        </div>
        <div className="col-6 col-md-3">
          <div className="card border-0 bg-light h-100">
            <div className="card-body text-center p-2">
              <Icon icon="ri:file-text-line" className="text-muted" style={{ fontSize: 20 }} />
              <div className="fw-bold fs-4 mt-1" data-testid="stat-invoices">
                {relations.invoiceCount.toLocaleString()}
              </div>
              <div className="text-muted small">Invoices</div>
            </div>
          </div>
        </div>
        <div className="col-6 col-md-3">
          <div className="card border-0 bg-light h-100">
            <div className="card-body text-center p-2">
              <Icon icon="ri:box-3-line" className="text-muted" style={{ fontSize: 20 }} />
              <div className="fw-bold fs-4 mt-1" data-testid="stat-products">
                {relations.productCount.toLocaleString()}
              </div>
              <div className="text-muted small">Products</div>
            </div>
          </div>
        </div>
      </div>

      {/* 4 sections: orders, customers, invoices, products */}
      <div className="row g-3">
        {/* Recent orders */}
        <div className="col-12 col-lg-6" data-testid="store-detail-orders-section">
          <div className="card h-100">
            <div className="card-header d-flex justify-content-between align-items-center">
              <strong>
                <Icon icon="ri:shopping-cart-2-line" className="me-1" />
                Recent Orders
              </strong>
              {relations.orderCount > relations.orders.length && (
                <span className="text-muted small">
                  showing {relations.orders.length} of {relations.orderCount}
                </span>
              )}
            </div>
            <div className="table-responsive" style={{ maxHeight: 320 }}>
              {relations.orders.length === 0 ? (
                <div className="text-muted small text-center py-3">No orders</div>
              ) : (
                <table className="table table-sm table-hover mb-0 align-middle">
                  <thead className="table-light position-sticky top-0">
                    <tr>
                      <th>Order #</th>
                      <th>Customer</th>
                      <th className="text-end">Amount</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {relations.orders.map((o) => (
                      <tr key={o.id} data-testid={`detail-order-row-${o.id}`}>
                        <td>
                          <Link href={`/orders/${o.id}`} className="text-decoration-none">
                            {o.order_number}
                          </Link>
                        </td>
                        <td>{o.customer_name ?? "—"}</td>
                        <td className="text-end">{fmtMoney(o.total_amount)}</td>
                        <td>
                          <span className="badge bg-secondary bg-opacity-10 text-secondary text-capitalize">
                            {o.status.replace("_", " ")}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>

        {/* Top customers */}
        <div className="col-12 col-lg-6" data-testid="store-detail-customers-section">
          <div className="card h-100">
            <div className="card-header d-flex justify-content-between align-items-center">
              <strong>
                <Icon icon="ri:user-line" className="me-1" />
                Top Customers
              </strong>
              {relations.customerCount > relations.customers.length && (
                <span className="text-muted small">
                  showing {relations.customers.length} of {relations.customerCount}
                </span>
              )}
            </div>
            <div className="table-responsive" style={{ maxHeight: 320 }}>
              {relations.customers.length === 0 ? (
                <div className="text-muted small text-center py-3">No customers</div>
              ) : (
                <table className="table table-sm table-hover mb-0 align-middle">
                  <thead className="table-light position-sticky top-0">
                    <tr>
                      <th>Name</th>
                      <th>Phone</th>
                      <th className="text-center">Orders</th>
                    </tr>
                  </thead>
                  <tbody>
                    {relations.customers.map((c) => (
                      <tr key={c.id} data-testid={`detail-customer-row-${c.id}`}>
                        <td>{c.full_name ?? "—"}</td>
                        <td className="text-muted small">{c.phone ?? "—"}</td>
                        <td className="text-center">
                          <span className="badge bg-primary bg-opacity-10 text-primary">
                            {c.order_count}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>

        {/* Recent invoices */}
        <div className="col-12 col-lg-6" data-testid="store-detail-invoices-section">
          <div className="card h-100">
            <div className="card-header d-flex justify-content-between align-items-center">
              <strong>
                <Icon icon="ri:file-text-line" className="me-1" />
                Recent Invoices
              </strong>
              {relations.invoiceCount > relations.invoices.length && (
                <span className="text-muted small">
                  showing {relations.invoices.length} of {relations.invoiceCount}
                </span>
              )}
            </div>
            <div className="table-responsive" style={{ maxHeight: 320 }}>
              {relations.invoices.length === 0 ? (
                <div className="text-muted small text-center py-3">No invoices</div>
              ) : (
                <table className="table table-sm table-hover mb-0 align-middle">
                  <thead className="table-light position-sticky top-0">
                    <tr>
                      <th>Invoice #</th>
                      <th>Order #</th>
                      <th className="text-end">Amount</th>
                      <th>Status</th>
                      <th>Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {relations.invoices.map((i) => (
                      <tr key={i.id} data-testid={`detail-invoice-row-${i.id}`}>
                        <td>
                          <Link href={`/invoices/${i.id}`} className="text-decoration-none">
                            {i.invoice_number}
                          </Link>
                        </td>
                        <td>{i.order_number ?? "—"}</td>
                        <td className="text-end">{fmtMoney(i.total_amount)}</td>
                        <td>
                          <span className="badge bg-secondary bg-opacity-10 text-secondary text-capitalize">
                            {i.status.replace("_", " ")}
                          </span>
                        </td>
                        <td className="text-muted small">
                          <ClientDate
                            value={i.created_at}
                            format="datetime"
                            options={{ year: "numeric", month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" }}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>

        {/* Products */}
        <div className="col-12 col-lg-6" data-testid="store-detail-products-section">
          <div className="card h-100">
            <div className="card-header d-flex justify-content-between align-items-center">
              <strong>
                <Icon icon="ri:box-3-line" className="me-1" />
                Products
              </strong>
              {relations.productCount > relations.products.length && (
                <span className="text-muted small">
                  showing {relations.products.length} of {relations.productCount}
                </span>
              )}
            </div>
            <div className="table-responsive" style={{ maxHeight: 320 }}>
              {relations.products.length === 0 ? (
                <div className="text-muted small text-center py-3">No products</div>
              ) : (
                <table className="table table-sm table-hover mb-0 align-middle">
                  <thead className="table-light position-sticky top-0">
                    <tr>
                      <th>Name</th>
                      <th>SKU</th>
                      <th className="text-end">MRP</th>
                      <th className="text-end">Stock</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {relations.products.map((p) => (
                      <tr key={p.id} data-testid={`detail-product-row-${p.id}`}>
                        <td>
                          <Link href={`/products/${p.id}`} className="text-decoration-none">
                            {p.name}
                          </Link>
                        </td>
                        <td className="text-muted small"><code>{p.sku ?? "—"}</code></td>
                        <td className="text-end">{fmtMoney(p.mrp)}</td>
                        <td className="text-end">{p.stock_quantity}</td>
                        <td>
                          <span
                            className={`badge ${
                              p.status === "active"
                                ? "bg-success-subtle text-success"
                                : "bg-secondary-subtle text-secondary"
                            } text-capitalize`}
                          >
                            {p.status.replace("_", " ")}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
