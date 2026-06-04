"use client";

import { useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { Icon } from "@iconify/react";
import type { InvoiceDetail } from "../actions";

const InvoicePDF = dynamic(() => import("./InvoicePDF"), { ssr: false });

export default function InvoiceDetailClient({ invoice }: { invoice: InvoiceDetail }) {
  const [showPdf, setShowPdf] = useState(false);
  const order = invoice.orders;
  const addr = order?.addresses;

  return (
    <>
      <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-4">
        <div className="d-flex align-items-center gap-3">
          <Link href="/invoices" className="btn btn-sm btn-outline-secondary">
            <Icon icon="ri:arrow-left-line" width={18} />
          </Link>
          <h4 className="fw-bold mb-0">Invoice #{invoice.invoice_number}</h4>
          <span className={`badge fs-6 ${invoice.status === "paid" ? "bg-success" : invoice.status === "sent" ? "bg-primary" : "bg-info"}`}>
            {invoice.status}
          </span>
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => setShowPdf(!showPdf)}>
          <Icon icon={showPdf ? "ri:file-text-line" : "ri:file-pdf-line"} width={16} className="me-1" />
          {showPdf ? "Show Details" : "Preview PDF"}
        </button>
      </div>

      {showPdf ? (
        <div className="card">
          <div className="card-body" style={{ minHeight: 500 }}>
            <InvoicePDF invoice={invoice} />
          </div>
        </div>
      ) : (
        <div className="row g-3">
          <div className="col-lg-6">
            <div className="card">
              <div className="card-header"><strong>Invoice Info</strong></div>
              <div className="card-body">
                <table className="table table-sm mb-0">
                  <tbody>
                    <tr><td className="text-muted" style={{ width: 130 }}>Invoice #</td><td className="fw-semibold">{invoice.invoice_number}</td></tr>
                    <tr><td className="text-muted">Type</td><td>{invoice.invoice_type}</td></tr>
                    <tr><td className="text-muted">Date</td><td>{new Date(invoice.invoice_date).toLocaleDateString("en-IN")}</td></tr>
                    <tr><td className="text-muted">Status</td><td><span className={`badge ${invoice.status === "paid" ? "bg-success" : "bg-info"}`}>{invoice.status}</span></td></tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
          <div className="col-lg-6">
            <div className="card">
              <div className="card-header"><strong>Order Info</strong></div>
              <div className="card-body">
                <table className="table table-sm mb-0">
                  <tbody>
                    <tr><td className="text-muted" style={{ width: 130 }}>Order #</td><td className="fw-semibold">{order?.order_number ?? "—"}</td></tr>
                    <tr><td className="text-muted">Customer</td><td>{order?.profiles?.full_name ?? "—"}</td></tr>
                    <tr><td className="text-muted">Phone</td><td>{order?.profiles?.phone ?? "—"}</td></tr>
                    <tr><td className="text-muted">GSTIN</td><td>{order?.gstin ?? "—"}</td></tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
          {addr && (
            <div className="col-12">
              <div className="card">
                <div className="card-header"><strong>Bill To</strong></div>
                <div className="card-body">
                  <p className="mb-1 fw-semibold">{addr.full_name}</p>
                  <p className="mb-1">{addr.phone}</p>
                  <p className="mb-0">
                    {addr.address_line1}{addr.address_line2 ? `, ${addr.address_line2}` : ""}
                    <br />{addr.city}, {addr.state} — {addr.pincode}
                  </p>
                </div>
              </div>
            </div>
          )}
          <div className="col-12">
            <div className="card">
              <div className="card-header"><strong>Items</strong></div>
              <div className="card-body p-0">
                <div className="table-responsive">
                  <table className="table table-hover mb-0 align-middle">
                    <thead className="table-light">
                      <tr>
                        <th>#</th>
                        <th>Product</th>
                        <th>HSN</th>
                        <th>Variant</th>
                        <th className="text-center">Qty</th>
                        <th className="text-end">Rate</th>
                        <th className="text-end">Amount</th>
                        <th className="text-end">GST%</th>
                      </tr>
                    </thead>
                    <tbody>
                      {order?.order_items.map((item, i) => (
                        <tr key={item.id}>
                          <td>{i + 1}</td>
                          <td>{item.products?.name ?? "—"}</td>
                          <td>{item.products?.hsn_code ?? "—"}</td>
                          <td>{item.product_variants?.name ?? "—"}</td>
                          <td className="text-center">{item.quantity}</td>
                          <td className="text-end">₹{Number(item.unit_price).toLocaleString()}</td>
                          <td className="text-end">₹{Number(item.total_price).toLocaleString()}</td>
                          <td className="text-end">{item.gst_rate}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
          <div className="col-md-6 offset-md-6">
            <div className="card">
              <div className="card-body">
                <table className="table table-sm mb-0">
                  <tbody>
                    <tr><td className="text-muted">Taxable Amount</td><td className="text-end fw-semibold">₹{Number(invoice.taxable_amount).toLocaleString()}</td></tr>
                    {invoice.cgst != null && Number(invoice.cgst) > 0 && (
                      <tr><td className="text-muted">CGST</td><td className="text-end">₹{Number(invoice.cgst).toLocaleString()}</td></tr>
                    )}
                    {invoice.sgst != null && Number(invoice.sgst) > 0 && (
                      <tr><td className="text-muted">SGST</td><td className="text-end">₹{Number(invoice.sgst).toLocaleString()}</td></tr>
                    )}
                    {invoice.igst != null && Number(invoice.igst) > 0 && (
                      <tr><td className="text-muted">IGST</td><td className="text-end">₹{Number(invoice.igst).toLocaleString()}</td></tr>
                    )}
                    <tr><td className="fw-bold">Total</td><td className="text-end fw-bold fs-5">₹{Number(invoice.total_amount).toLocaleString()}</td></tr>
                  </tbody>
                </table>
                {invoice.amount_in_words && <p className="small text-muted mt-2 mb-0">Amount in words: {invoice.amount_in_words}</p>}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
