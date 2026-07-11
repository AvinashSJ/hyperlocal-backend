"use client";

import { useState } from "react";
import Link from "next/link";
import { Icon } from "@iconify/react";
import type { InvoiceDetail } from "../actions";
import ClientDate from "@/components/ClientDate";

type GstSlab = {
  rate: number;
  taxableAmount: number;
  cgst: number;
  sgst: number;
};

function computeGstSlabs(items: { gst_rate: number; gst_amount: number; total_price: number }[]): GstSlab[] {
  const map = new Map<number, GstSlab>();
  for (const item of items) {
    const rate = item.gst_rate;
    if (!map.has(rate)) {
      map.set(rate, { rate, taxableAmount: 0, cgst: 0, sgst: 0 });
    }
    const slab = map.get(rate)!;
    slab.taxableAmount += Number(item.total_price) - Number(item.gst_amount);
    slab.cgst += Number(item.gst_amount) / 2;
    slab.sgst += Number(item.gst_amount) / 2;
  }
  return Array.from(map.values()).sort((a, b) => b.rate - a.rate);
}

export default function InvoiceDetailClient({ invoice }: { invoice: InvoiceDetail }) {
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const order = invoice.orders;
  const addr = order?.addresses;
  const items = order?.order_items ?? [];
  const slabs = computeGstSlabs(items);
  const totalCgst = slabs.reduce((s, slab) => s + slab.cgst, 0);
  const totalSgst = slabs.reduce((s, slab) => s + slab.sgst, 0);
  const totalTaxable = slabs.reduce((s, slab) => s + slab.taxableAmount, 0);

  async function handleDownload() {
    setDownloading(true);
    setDownloadError(null);
    try {
      const res = await fetch(`/api/invoices/${invoice.id}/pdf`);
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Download failed (${res.status})`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `invoice-${invoice.invoice_number}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setDownloadError(err instanceof Error ? err.message : "Download failed");
    } finally {
      setDownloading(false);
    }
  }

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
        <div className="d-flex gap-2">
          <button
            type="button"
            className="btn btn-sm btn-primary"
            onClick={handleDownload}
            disabled={downloading}
            data-testid="download-invoice-btn"
          >
            <Icon icon="ri:download-2-line" width={16} className="me-1" />
            {downloading ? "Downloading…" : "Download PDF"}
          </button>
        </div>
      </div>

      {downloadError && (
        <div className="alert alert-danger py-2 mb-3" role="alert">
          {downloadError}
        </div>
      )}

      <div className="row g-3">
          <div className="col-lg-6">
            <div className="card">
              <div className="card-header"><strong>Invoice Info</strong></div>
              <div className="card-body">
                <table className="table table-sm mb-0">
                  <tbody>
                    <tr><td className="text-muted" style={{ width: 130 }}>Invoice #</td><td className="fw-semibold">{invoice.invoice_number}</td></tr>
                    <tr><td className="text-muted">Type</td><td>{invoice.invoice_type}</td></tr>
                    <tr><td className="text-muted">Date</td><td><ClientDate value={invoice.invoice_date} format="date" /></td></tr>
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
          {invoice.store && (
            <div className="col-12">
              <div className="card">
                <div className="card-header"><strong>Seller</strong></div>
                <div className="card-body">
                  <p className="mb-1 fw-semibold">{invoice.store.legal_name ?? invoice.store.name}</p>
                  {invoice.store.address && <p className="mb-1">{invoice.store.address}</p>}
                  <p className="mb-1">
                    {[invoice.store.city, invoice.store.state, invoice.store.pincode].filter(Boolean).join(", ")}
                  </p>
                  {invoice.store.gstin && <p className="mb-0 small text-muted">GSTIN: {invoice.store.gstin}</p>}
                </div>
              </div>
            </div>
          )}
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
                        <th className="text-center">Qty</th>
                        <th className="text-end">Rate</th>
                        <th className="text-end">Taxable</th>
                        <th className="text-end">CGST</th>
                        <th className="text-end">SGST</th>
                        <th className="text-end">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {order?.order_items.map((item, i) => {
                        const taxable = Number(item.total_price) - Number(item.gst_amount);
                        const cgst = Number(item.gst_amount) / 2;
                        const sgst = Number(item.gst_amount) / 2;
                        const variant = item.variant_name ?? item.product_variants?.name;
                        const productLabel = variant
                          ? `${item.product_name ?? item.products?.name ?? "Deleted Product"} — ${variant}`
                          : item.product_name ?? item.products?.name ?? "Deleted Product";

                        return (
                          <tr key={item.id}>
                            <td>{i + 1}</td>
                            <td>{productLabel}</td>
                            <td>{item.product_hsn_code ?? item.products?.hsn_code ?? "—"}</td>
                            <td className="text-center">{item.quantity}</td>
                            <td className="text-end">₹{Number(item.unit_price).toLocaleString()}</td>
                            <td className="text-end">₹{taxable.toLocaleString()}</td>
                            <td className="text-end">₹{cgst.toLocaleString()}</td>
                            <td className="text-end">₹{sgst.toLocaleString()}</td>
                            <td className="text-end">₹{Number(item.total_price).toLocaleString()}</td>
                          </tr>
                        );
                      })}
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
                    {slabs.flatMap((slab) => [
                      <tr key={`h-${slab.rate}`}>
                        <td colSpan={2}><strong>Items at {slab.rate}% GST</strong></td>
                      </tr>,
                      <tr key={`tx-${slab.rate}`}>
                        <td className="text-muted ps-3">Taxable</td>
                        <td className="text-end">₹{slab.taxableAmount.toLocaleString()}</td>
                      </tr>,
                      <tr key={`cg-${slab.rate}`}>
                        <td className="text-muted ps-3">CGST @ {slab.rate / 2}%</td>
                        <td className="text-end">₹{slab.cgst.toLocaleString()}</td>
                      </tr>,
                      <tr key={`sg-${slab.rate}`}>
                        <td className="text-muted ps-3">SGST @ {slab.rate / 2}%</td>
                        <td className="text-end">₹{slab.sgst.toLocaleString()}</td>
                      </tr>,
                    ])}
                    <tr><td colSpan={2}><hr className="my-1" /></td></tr>
                    {slabs.length > 0 && (
                      <>
                        <tr><td className="fw-semibold">Total Taxable</td><td className="text-end fw-semibold">₹{totalTaxable.toLocaleString()}</td></tr>
                        {totalCgst > 0 && <tr><td className="text-muted">Total CGST</td><td className="text-end">₹{totalCgst.toLocaleString()}</td></tr>}
                        {totalSgst > 0 && <tr><td className="text-muted">Total SGST</td><td className="text-end">₹{totalSgst.toLocaleString()}</td></tr>}
                      </>
                    )}
                    <tr><td className="fw-bold">Total</td><td className="text-end fw-bold fs-5">₹{Number(invoice.total_amount).toLocaleString()}</td></tr>
                  </tbody>
                </table>
                {invoice.amount_in_words && <p className="small text-muted mt-2 mb-0">Amount in words: {invoice.amount_in_words}</p>}
              </div>
            </div>
          </div>
        </div>
    </>
  );
}
