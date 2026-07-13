"use client";

import { useState, useRef, useCallback } from "react";
import { Icon } from "@iconify/react";
import type {
  RevenueSummary,
  RevenueByStore,
  RevenueByMethod,
  MonthlyRevenue,
  GSTSummary,
  GSTMonthly,
  GSTByHSN,
  GSTByStore,
  PnLSummary,
  ProductSaleRow,
  GSTFilingRow,
  GSTFilingSummary,
} from "./actions";

type Tab = "revenue" | "gst" | "pnl" | "product-sales" | "gst-filing";

function fmt(n: number): string {
  return n.toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

function currency(n: number): string {
  return n < 0 ? `-₹${fmt(Math.abs(n))}` : `₹${fmt(n)}`;
}

const MONTH_LABELS: Record<string, string> = {
  "01": "Jan", "02": "Feb", "03": "Mar", "04": "Apr",
  "05": "May", "06": "Jun", "07": "Jul", "08": "Aug",
  "09": "Sep", "10": "Oct", "11": "Nov", "12": "Dec",
};

function monthLabel(key: string): string {
  const [, m] = key.split("-");
  return MONTH_LABELS[m] ?? key;
}

function StatCard({ label, value, icon, color }: { label: string; value: string; icon: string; color: string }) {
  return (
    <div className="card shadow-sm border-0">
      <div className="card-body d-flex align-items-center gap-3">
        <div className={`rounded-circle d-flex align-items-center justify-content-center`} style={{ width: 48, height: 48, backgroundColor: `${color}15` }}>
          <Icon icon={icon} width={22} style={{ color }} />
        </div>
        <div>
          <small className="text-muted d-block">{label}</small>
          <span className="fw-bold fs-5">{value}</span>
        </div>
      </div>
    </div>
  );
}

function downloadCSV(filename: string, columns: string[], rows: Record<string, unknown>[]) {
  const escape = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = columns.join(",");
  const body = rows.map((r) => columns.map((c) => escape(r[c])).join(","));
  const csv = [header, ...body].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function ReportsClient({
  storeId,
  initial,
}: {
  storeId: string | null;
  initial: {
    revenueSummary: RevenueSummary;
    revenueByStore: RevenueByStore[];
    revenueByMethod: RevenueByMethod[];
    monthlyRevenue: MonthlyRevenue[];
    gstSummary: GSTSummary;
    gstMonthly: GSTMonthly[];
    gstByHSN: GSTByHSN[];
    gstByStore: GSTByStore[];
    pnl: PnLSummary;
    productSales: ProductSaleRow[];
    gstFiling: { rows: GSTFilingRow[]; summary: GSTFilingSummary };
  };
}) {
  const [tab, setTab] = useState<Tab>("revenue");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [loading, setLoading] = useState(false);

  const [revSummary, setRevSummary] = useState(initial.revenueSummary);
  const [revByStore, setRevByStore] = useState(initial.revenueByStore);
  const [revByMethod, setRevByMethod] = useState(initial.revenueByMethod);
  const [monthlyRev, setMonthlyRev] = useState(initial.monthlyRevenue);
  const [gstSummary, setGstSummary] = useState(initial.gstSummary);
  const [gstMonthly, setGstMonthly] = useState(initial.gstMonthly);
  const [gstHSN, setGstHSN] = useState(initial.gstByHSN);
  const [gstByStore, setGstByStore] = useState(initial.gstByStore);
  const [pnl, setPnl] = useState(initial.pnl);
  const [productSales, setProductSales] = useState(initial.productSales);
  const [gstFiling, setGstFiling] = useState(initial.gstFiling);

  const applyFilter = useCallback(async () => {
    setLoading(true);
    try {
      const {
        getRevenueSummary, getRevenueByStore, getRevenueByMethod, getMonthlyRevenue,
        getGSTSummary, getGSTMonthly, getGSTByHSN, getGSTByStore,
        getPnLSummary, getProductSales, getGSTFiling,
      } = await import("./actions");

      const s = startDate || null;
      const e = endDate || null;

      const [rs, rs2, rm, mr, gs, gm, gh, gbs, pnlData, ps, gf] = await Promise.all([
        getRevenueSummary(s, e, storeId),
        !storeId ? getRevenueByStore(s, e) : Promise.resolve([] as Awaited<ReturnType<typeof getRevenueByStore>>),
        getRevenueByMethod(s, e, storeId),
        getMonthlyRevenue(s, e, storeId),
        getGSTSummary(s, e, storeId),
        getGSTMonthly(s, e, storeId),
        getGSTByHSN(s, e, storeId),
        !storeId ? getGSTByStore(s, e) : Promise.resolve([] as Awaited<ReturnType<typeof getGSTByStore>>),
        getPnLSummary(s, e, storeId),
        getProductSales(s, e, storeId),
        getGSTFiling(s, e, storeId),
      ]);

      setRevSummary(rs);
      setRevByStore(rs2);
      setRevByMethod(rm);
      setMonthlyRev(mr);
      setGstSummary(gs);
      setGstMonthly(gm);
      setGstHSN(gh);
      setGstByStore(gbs);
      setPnl(pnlData);
      setProductSales(ps);
      setGstFiling(gf);
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, storeId]);

  const chartCategories = monthlyRev.map((m) => monthLabel(m.month));
  const chartSeries = [{ name: "Revenue", data: monthlyRev.map((m) => m.total_revenue) }];

  const maxRevenue = Math.max(...monthlyRev.map((m) => m.total_revenue), 1);

  return (
    <div>
      <h4 className="mb-3">Reports</h4>

      <div className="card shadow-sm border-0 mb-3">
        <div className="card-body d-flex flex-wrap gap-2 align-items-center">
          <div>
            <label className="form-label mb-0 small">From</label>
            <input
              type="date"
              className="form-control form-control-sm"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              style={{ width: 160 }}
            />
          </div>
          <div>
            <label className="form-label mb-0 small">To</label>
            <input
              type="date"
              className="form-control form-control-sm"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              style={{ width: 160 }}
            />
          </div>
          <button
            className="btn btn-sm btn-primary mt-auto"
            onClick={applyFilter}
            disabled={loading}
          >
            {loading ? (
              <span className="spinner-border spinner-border-sm me-1" />
            ) : (
              <Icon icon="mdi:filter" className="me-1" />
            )}
            Apply
          </button>
          {(startDate || endDate) && (
            <button
              className="btn btn-sm btn-outline-secondary mt-auto"
              onClick={() => { setStartDate(""); setEndDate(""); }}
            >
              Clear
            </button>
          )}
        </div>
      </div>

      <ul className="nav nav-tabs mb-3">
        <li className="nav-item">
          <button className={`nav-link ${tab === "revenue" ? "active fw-semibold" : ""}`} onClick={() => setTab("revenue")}>
            <Icon icon="mdi:currency-inr" className="me-1" />Revenue
          </button>
        </li>
        <li className="nav-item">
          <button className={`nav-link ${tab === "gst" ? "active fw-semibold" : ""}`} onClick={() => setTab("gst")}>
            <Icon icon="mdi:receipt-text-outline" className="me-1" />GST
          </button>
        </li>
        <li className="nav-item">
          <button className={`nav-link ${tab === "pnl" ? "active fw-semibold" : ""}`} onClick={() => setTab("pnl")}>
            <Icon icon="mdi:finance" className="me-1" />P&amp;L
          </button>
        </li>
        <li className="nav-item">
          <button className={`nav-link ${tab === "product-sales" ? "active fw-semibold" : ""}`} onClick={() => setTab("product-sales")}>
            <Icon icon="mdi:package-variant-closed" className="me-1" />Product Sales
          </button>
        </li>
        <li className="nav-item">
          <button className={`nav-link ${tab === "gst-filing" ? "active fw-semibold" : ""}`} onClick={() => setTab("gst-filing")}>
            <Icon icon="mdi:file-document-edit" className="me-1" />GST Filing
          </button>
        </li>
      </ul>

      {tab === "revenue" && (
        <div>
          <div className="row g-3 mb-4">
            <div className="col-md-3">
              <StatCard label="Total Revenue" value={currency(revSummary.totalRevenue)} icon="mdi:currency-inr" color="#0d6efd" />
            </div>
            <div className="col-md-3">
              <StatCard label="Total Orders" value={revSummary.ordersCount.toLocaleString()} icon="mdi:shopping-cart" color="#198754" />
            </div>
            <div className="col-md-3">
              <StatCard label="Avg Order Value" value={currency(revSummary.avgOrderValue)} icon="mdi:cart-outline" color="#6f42c1" />
            </div>
            <div className="col-md-3">
              <StatCard label="Revenue Today" value={currency(revSummary.todayRevenue)} icon="mdi:calendar-today" color="#fd7e14" />
            </div>
          </div>
          {monthlyRev.length > 0 && (
            <div className="card shadow-sm border-0 mb-4">
              <div className="card-header bg-white fw-semibold d-flex justify-content-between align-items-center">
                <span><Icon icon="mdi:chart-bar" className="me-1" />Monthly Revenue</span>
              </div>
              <div className="card-body" style={{ height: 260 }}>
                <div className="d-flex align-items-end gap-2 h-100" style={{ paddingBottom: 24 }}>
                  {monthlyRev.map((m) => {
                    const pct = maxRevenue > 0 ? (m.total_revenue / maxRevenue) * 100 : 0;
                    return (
                      <div key={m.month} className="flex-grow-1 d-flex flex-column align-items-center" style={{ height: "100%" }}>
                        <small className="fw-medium mb-1" style={{ fontSize: "0.7rem" }}>{currency(m.total_revenue)}</small>
                        <div className="rounded w-100" style={{ height: `${Math.max(pct, 2)}%`, backgroundColor: "#0d6efd", opacity: 0.6 + (pct / 100) * 0.4, minHeight: 4 }} />
                        <small className="text-muted mt-1" style={{ fontSize: "0.65rem" }}>{monthLabel(m.month)}</small>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
          <div className="row g-3">
            {!storeId && revByStore.length > 0 && (
              <div className="col-md-6">
                <div className="card shadow-sm border-0">
                  <div className="card-header bg-white fw-semibold">Revenue by Store</div>
                  <div className="table-responsive">
                    <table className="table table-sm mb-0">
                      <thead className="table-light">
                        <tr><th>Store</th><th className="text-end">Revenue</th><th className="text-end">Orders</th><th className="text-end">Avg Value</th></tr>
                      </thead>
                      <tbody>
                        {revByStore.map((s) => (
                          <tr key={s.store_name}>
                            <td>{s.store_name}</td>
                            <td className="text-end">{currency(s.total_revenue)}</td>
                            <td className="text-end">{s.orders_count}</td>
                            <td className="text-end">{currency(s.avg_order_value)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
            <div className={!storeId && revByStore.length > 0 ? "col-md-6" : "col-md-12"}>
              <div className="card shadow-sm border-0">
                <div className="card-header bg-white fw-semibold">Revenue by Payment Method</div>
                <div className="table-responsive">
                  <table className="table table-sm mb-0">
                    <thead className="table-light">
                      <tr><th>Method</th><th className="text-end">Revenue</th><th className="text-end">Orders</th></tr>
                    </thead>
                    <tbody>
                      {revByMethod.length === 0 ? (
                        <tr><td colSpan={3} className="text-center text-muted py-3">No data</td></tr>
                      ) : (
                        revByMethod.map((m) => (
                          <tr key={m.payment_method}>
                            <td>{m.payment_method}</td>
                            <td className="text-end">{currency(m.total_revenue)}</td>
                            <td className="text-end">{m.orders_count}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === "gst" && (
        <div>
          <div className="row g-3 mb-4">
            <div className="col-md-3">
              <StatCard label="Total GST" value={currency(gstSummary.totalGst)} icon="mdi:receipt" color="#0d6efd" />
            </div>
            <div className="col-md-3">
              <StatCard label="Taxable Amount" value={currency(gstSummary.totalTaxableAmount)} icon="mdi:calculator" color="#198754" />
            </div>
            <div className="col-md-3">
              <StatCard label="Total Revenue" value={currency(gstSummary.totalRevenue)} icon="mdi:currency-inr" color="#6f42c1" />
            </div>
            <div className="col-md-3">
              <StatCard label="Invoices" value={gstSummary.invoicesCount.toLocaleString()} icon="mdi:file-document-outline" color="#fd7e14" />
            </div>
          </div>
          <div className="row g-3">
            {gstMonthly.length > 0 && (
              <div className={gstHSN.length > 0 ? "col-md-6" : "col-md-12"}>
                <div className="card shadow-sm border-0">
                  <div className="card-header bg-white fw-semibold">Monthly GST</div>
                  <div className="table-responsive">
                    <table className="table table-sm mb-0">
                      <thead className="table-light">
                        <tr><th>Period</th><th className="text-end">Taxable</th><th className="text-end">CGST</th><th className="text-end">SGST</th><th className="text-end">Total GST</th></tr>
                      </thead>
                      <tbody>
                        {gstMonthly.map((m) => (
                          <tr key={m.month}>
                            <td>{monthLabel(m.month)}</td>
                            <td className="text-end">{currency(m.taxable_amount)}</td>
                            <td className="text-end">{currency(m.cgst)}</td>
                            <td className="text-end">{currency(m.sgst)}</td>
                            <td className="text-end fw-medium">{currency(m.total_gst)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
            {gstHSN.length > 0 && (
              <div className={gstMonthly.length > 0 ? "col-md-6" : "col-md-12"}>
                <div className="card shadow-sm border-0">
                  <div className="card-header bg-white fw-semibold">GST by HSN Code</div>
                  <div className="table-responsive">
                    <table className="table table-sm mb-0">
                      <thead className="table-light">
                        <tr><th>HSN</th><th className="text-center">Rate</th><th className="text-end">Items</th><th className="text-end">Taxable</th><th className="text-end">GST</th></tr>
                      </thead>
                      <tbody>
                        {gstHSN.map((h, i) => (
                          <tr key={`${h.hsn_code}_${h.gst_rate}_${i}`}>
                            <td><code>{h.hsn_code}</code></td>
                            <td className="text-center">{h.gst_rate}%</td>
                            <td className="text-end">{h.product_count}</td>
                            <td className="text-end">{currency(h.taxable_value)}</td>
                            <td className="text-end">{currency(h.gst_amount)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </div>
          {!storeId && gstByStore.length > 0 && (
            <div className="card shadow-sm border-0 mt-3">
              <div className="card-header bg-white fw-semibold">GST by Store</div>
              <div className="table-responsive">
                <table className="table table-sm mb-0">
                  <thead className="table-light">
                    <tr><th>Store</th><th className="text-end">Taxable</th><th className="text-end">CGST</th><th className="text-end">SGST</th><th className="text-end">Total GST</th></tr>
                  </thead>
                  <tbody>
                    {gstByStore.map((s) => (
                      <tr key={s.store_name}>
                        <td>{s.store_name}</td>
                        <td className="text-end">{currency(s.taxable_amount)}</td>
                        <td className="text-end">{currency(s.cgst)}</td>
                        <td className="text-end">{currency(s.sgst)}</td>
                        <td className="text-end fw-medium">{currency(s.total_gst)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ===== P&L Tab ===== */}
      {tab === "pnl" && (
        <div>
          <div className="d-flex justify-content-end mb-3">
            <button
              className="btn btn-sm btn-outline-success"
              onClick={() => downloadCSV("pnl-report.csv", ["Line Item", "Amount"], [
                { "Line Item": "Gross Revenue", Amount: pnl.grossRevenue },
                { "Line Item": "Less: Discounts", Amount: pnl.discounts },
                { "Line Item": "Less: Returns & Refunds", Amount: pnl.returnsRefunds },
                { "Line Item": "Net Revenue", Amount: pnl.netRevenue },
                { "Line Item": "Less: Cost of Goods Sold", Amount: pnl.cogs },
                { "Line Item": "Less: Delivery Charges", Amount: pnl.deliveryCharges },
                { "Line Item": "Less: Commissions", Amount: pnl.commissions },
                { "Line Item": "Gross Profit", Amount: pnl.grossProfit },
                { "Line Item": "Less: GST Collected", Amount: pnl.gstCollected },
                { "Line Item": "Net Profit", Amount: pnl.netProfit },
              ])}
            >
              <Icon icon="mdi:download" className="me-1" />Download CSV
            </button>
          </div>
          <div className="row g-3 mb-4">
            <div className="col-md-4">
              <StatCard label="Gross Revenue" value={currency(pnl.grossRevenue)} icon="mdi:currency-inr" color="#198754" />
            </div>
            <div className="col-md-4">
              <StatCard label="Net Revenue" value={currency(pnl.netRevenue)} icon="mdi:cart-outline" color="#0d6efd" />
            </div>
            <div className="col-md-4">
              <StatCard label="Net Profit" value={currency(pnl.netProfit)} icon={pnl.netProfit >= 0 ? "mdi:trending-up" : "mdi:trending-down"} color={pnl.netProfit >= 0 ? "#198754" : "#dc3545"} />
            </div>
          </div>
          <div className="card shadow-sm border-0">
            <div className="card-header bg-white fw-semibold">Profit & Loss Statement</div>
            <div className="table-responsive">
              <table className="table table-sm mb-0">
                <thead className="table-light">
                  <tr><th>Line Item</th><th className="text-end">Amount</th></tr>
                </thead>
                <tbody>
                  <tr className="table-success"><td className="fw-medium">Gross Revenue</td><td className="text-end fw-medium">{currency(pnl.grossRevenue)}</td></tr>
                  <tr><td className="text-muted ps-4">&mdash; Discounts</td><td className="text-end">{currency(pnl.discounts)}</td></tr>
                  <tr><td className="text-muted ps-4">&mdash; Returns &amp; Refunds</td><td className="text-end">{currency(pnl.returnsRefunds)}</td></tr>
                  <tr className="table-info"><td className="fw-medium">Net Revenue</td><td className="text-end fw-medium">{currency(pnl.netRevenue)}</td></tr>
                  <tr><td className="text-muted ps-4">&mdash; Cost of Goods Sold</td><td className="text-end">{currency(pnl.cogs)}</td></tr>
                  <tr><td className="text-muted ps-4">&mdash; Delivery Charges</td><td className="text-end">{currency(pnl.deliveryCharges)}</td></tr>
                  <tr><td className="text-muted ps-4">&mdash; Commissions</td><td className="text-end">{currency(pnl.commissions)}</td></tr>
                  <tr className={pnl.grossProfit >= 0 ? "table-success" : "table-danger"}><td className="fw-medium">Gross Profit</td><td className="text-end fw-medium">{currency(pnl.grossProfit)}</td></tr>
                  <tr><td className="text-muted ps-4">&mdash; GST Collected</td><td className="text-end">{currency(pnl.gstCollected)}</td></tr>
                  <tr className={pnl.netProfit >= 0 ? "table-success" : "table-danger"}><td className="fw-bold">Net Profit</td><td className="text-end fw-bold">{currency(pnl.netProfit)}</td></tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ===== Product Sales Tab ===== */}
      {tab === "product-sales" && (
        <div>
          <div className="d-flex justify-content-end mb-3">
            <button
              className="btn btn-sm btn-outline-success"
              onClick={() => downloadCSV("product-sales.csv", ["Product", "Variant", "HSN Code", "Units Sold", "Total Revenue", "Avg Unit Price", "GST Collected"], productSales)}
            >
              <Icon icon="mdi:download" className="me-1" />Download CSV
            </button>
          </div>
          <div className="card shadow-sm border-0">
            <div className="card-header bg-white fw-semibold">Product Wise Sales</div>
            <div className="table-responsive">
              <table className="table table-sm mb-0">
                <thead className="table-light">
                  <tr>
                    <th>Product</th>
                    <th>Variant</th>
                    <th>HSN</th>
                    <th className="text-end">Units Sold</th>
                    <th className="text-end">Total Revenue</th>
                    <th className="text-end">Avg Price</th>
                    <th className="text-end">GST</th>
                  </tr>
                </thead>
                <tbody>
                  {productSales.length === 0 ? (
                    <tr><td colSpan={7} className="text-center text-muted py-3">No data</td></tr>
                  ) : (
                    productSales.map((p, i) => (
                      <tr key={i}>
                        <td>{p.product_name}</td>
                        <td className="text-muted">{p.variant_name ?? "—"}</td>
                        <td><code>{p.hsn_code ?? "—"}</code></td>
                        <td className="text-end">{p.units_sold}</td>
                        <td className="text-end">{currency(p.total_revenue)}</td>
                        <td className="text-end">{currency(p.avg_unit_price)}</td>
                        <td className="text-end">{currency(p.gst_collected)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ===== GST Filing Tab ===== */}
      {tab === "gst-filing" && (
        <div>
          <div className="d-flex justify-content-end mb-3">
            <button
              className="btn btn-sm btn-outline-success"
              onClick={() => downloadCSV("gst-filing.csv", ["HSN Code", "Rate", "Items", "Taxable Value", "CGST", "SGST", "IGST", "Total GST"], gstFiling.rows)}
            >
              <Icon icon="mdi:download" className="me-1" />Download CSV
            </button>
          </div>
          <div className="row g-3 mb-4">
            <div className="col-md-3">
              <StatCard label="Total Taxable" value={currency(gstFiling.summary.totalTaxable)} icon="mdi:calculator" color="#0d6efd" />
            </div>
            <div className="col-md-3">
              <StatCard label="Total CGST" value={currency(gstFiling.summary.totalCGST)} icon="mdi:receipt" color="#198754" />
            </div>
            <div className="col-md-3">
              <StatCard label="Total SGST" value={currency(gstFiling.summary.totalSGST)} icon="mdi:receipt" color="#6f42c1" />
            </div>
            <div className="col-md-3">
              <StatCard label="Total GST" value={currency(gstFiling.summary.totalGST)} icon="mdi:file-document" color="#fd7e14" />
            </div>
          </div>
          <div className="card shadow-sm border-0">
            <div className="card-header bg-white fw-semibold">GST Filing Report (GSTR-1)</div>
            <div className="table-responsive">
              <table className="table table-sm mb-0">
                <thead className="table-light">
                  <tr>
                    <th>HSN Code</th>
                    <th className="text-center">Rate</th>
                    <th className="text-end">Items</th>
                    <th className="text-end">Taxable Value</th>
                    <th className="text-end">CGST</th>
                    <th className="text-end">SGST</th>
                    <th className="text-end">IGST</th>
                    <th className="text-end">Total GST</th>
                  </tr>
                </thead>
                <tbody>
                  {gstFiling.rows.length === 0 ? (
                    <tr><td colSpan={8} className="text-center text-muted py-3">No data</td></tr>
                  ) : (
                    gstFiling.rows.map((r, i) => (
                      <tr key={i}>
                        <td><code>{r.hsn_code}</code></td>
                        <td className="text-center">{r.gst_rate}%</td>
                        <td className="text-end">{r.items_count}</td>
                        <td className="text-end">{currency(r.taxable_value)}</td>
                        <td className="text-end">{currency(r.cgst)}</td>
                        <td className="text-end">{currency(r.sgst)}</td>
                        <td className="text-end">{currency(r.igst)}</td>
                        <td className="text-end fw-medium">{currency(r.total_gst)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <div className="card-footer bg-white">
              <div className="row text-end small fw-semibold">
                <div className="col"><span className="text-muted">Total Taxable: </span>{currency(gstFiling.summary.totalTaxable)}</div>
                <div className="col"><span className="text-muted">CGST: </span>{currency(gstFiling.summary.totalCGST)}</div>
                <div className="col"><span className="text-muted">SGST: </span>{currency(gstFiling.summary.totalSGST)}</div>
                <div className="col"><span className="text-muted">IGST: </span>{currency(gstFiling.summary.totalIGST)}</div>
                <div className="col"><span className="text-muted">Total GST: </span>{currency(gstFiling.summary.totalGST)}</div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
