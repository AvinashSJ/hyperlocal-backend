"use client";

import { useState, useEffect, useMemo, type ReactNode } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { Icon } from "@iconify/react";
import { Sensitive } from "@/components/SensitiveAmount";

const ApexChart = dynamic(() => import("react-apexcharts"), { ssr: false });

type MonthlyData = { month: string; total: number };

type LowStockItem = {
  id: string; name: string; sku: string | null;
  stock_quantity: number; low_stock_threshold: number | null;
};

type RecentOrder = {
  id: string; order_number: string; status: string;
  total_amount: number; payment_status: string;
  placed_at: string;
  profiles: { full_name: string | null }[] | null;
};

type Stats = {
  productCount: number; orderCount: number; customerCount: number;
  totalRevenue: number; monthlyData: MonthlyData[];
  lowStock: LowStockItem[];
  todayOrders: number; todayRevenue: number;
  recentOrders: RecentOrder[];
  statusBreakdown: Record<string, number>;
};



const STATUS_BADGES: Record<string, string> = {
  pending: "bg-warning text-dark", confirmed: "bg-info text-white",
  processing: "bg-primary text-white", out_for_delivery: "bg-secondary text-white",
  delivered: "bg-success text-white", cancelled: "bg-danger text-white",
  returned: "bg-dark text-white",
  return_requested: "bg-warning text-dark",
  return_processing: "bg-info text-white",
  return_approved: "bg-info text-white",
  return_rejected: "bg-dark text-white",
};

export default function DashboardClient({ stats }: { stats: Stats }) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem("dash_sensitive_visible");
    if (stored !== null) setVisible(stored === "true");
  }, []);

  const toggle = () => {
    setVisible((v) => {
      const next = !v;
      localStorage.setItem("dash_sensitive_visible", String(next));
      return next;
    });
  };

  const chartOptions = useMemo(() => ({
    chart: { type: "area" as const, toolbar: { show: false } },
    dataLabels: { enabled: false },
    stroke: { curve: "smooth" as const, width: 2 },
    colors: ["#0d6efd"],
    fill: { type: "gradient", gradient: { shadeIntensity: 1, opacityFrom: 0.3, opacityTo: 0 } },
    xaxis: { categories: stats.monthlyData.map((d) => d.month), labels: { style: { colors: "#6c757d", fontSize: "12px" } } },
    yaxis: { labels: { style: { colors: "#6c757d", fontSize: "12px" } } },
    grid: { borderColor: "#e9ecef", strokeDashArray: 4 },
    tooltip: { y: { formatter: (v: number) => `₹${v.toLocaleString()}` } },
  }), [stats.monthlyData]);

  const chartSeries = useMemo(() => [{ name: "Orders", data: stats.monthlyData.map((d) => d.total) }], [stats.monthlyData]);

  const statusLabels = useMemo(() => Object.keys(stats.statusBreakdown), [stats.statusBreakdown]);
  const statusValues = Object.values(stats.statusBreakdown);
  const statusColors: Record<string, string> = {
    pending: "#ffc107", confirmed: "#0dcaf0", processing: "#0d6efd",
    shipped: "#6c757d", delivered: "#198754", cancelled: "#dc3545",
    returned: "#212529",
  };

  const pieOptions = useMemo(() => ({
    chart: { type: "donut" as const },
    labels: statusLabels,
    colors: statusLabels.map((s) => statusColors[s] ?? "#6c757d"),
    dataLabels: { enabled: true, style: { fontSize: "12px" }, dropShadow: { enabled: false } },
    legend: { position: "bottom" as const, fontSize: "13px" },
    plotOptions: { pie: { donut: { size: "55%" } } },
  }), [statusLabels]);

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h4 className="fw-bold mb-0">Dashboard</h4>
        <button
          className="btn btn-sm btn-outline-secondary d-flex align-items-center gap-1"
          onClick={toggle}
          title={visible ? "Hide revenue amounts" : "Show revenue amounts"}
          data-testid="dash-sensitive-toggle"
        >
          <Icon icon={visible ? "mdi:eye-outline" : "mdi:eye-off-outline"} width={16} />
          {visible ? "Hide" : "Show"}
        </button>
      </div>

      <div className="row g-3 mb-4">
        <StatCard title="Products" value={stats.productCount} icon="ri:store-2-line" color="#0d6efd" href="/products" />
        <StatCard title="Orders" value={stats.orderCount} icon="ri:shopping-cart-line" color="#198754" href="/orders" />
        <StatCard title="Customers" value={stats.customerCount} icon="ri:user-3-line" color="#6f42c1" href="/customers" />
        <StatCard title="Total Revenue" value={<Sensitive visible={visible}>₹{stats.totalRevenue.toLocaleString()}</Sensitive>} icon="ri:money-rupee-circle-line" color="#fd7e14" href="/invoices" />
        <StatCard title="Today's Orders" value={stats.todayOrders} icon="ri:calendar-check-line" color="#0dcaf0" href="/orders" />
        <StatCard title="Today's Revenue" value={<Sensitive visible={visible}>₹{stats.todayRevenue.toLocaleString()}</Sensitive>} icon="ri:coin-line" color="#d63384" href="/invoices" />
      </div>

      <div className="row g-3">
        <div className="col-lg-8">
          <div className="card">
            <div className="card-body">
              <h6 className="card-title fw-semibold mb-3">Monthly Orders</h6>
              {stats.monthlyData.length > 0 ? (
                <ApexChart options={chartOptions} series={chartSeries} type="area" height={320} />
              ) : (
                <p className="text-muted text-center py-5">No order data yet</p>
              )}
            </div>
          </div>

          <div className="card mt-3">
            <div className="card-header d-flex justify-content-between align-items-center">
              <h6 className="fw-semibold mb-0">Recent Orders</h6>
              <Link href="/orders" className="btn btn-sm btn-outline-primary">View All</Link>
            </div>
            <div className="card-body p-0">
              {stats.recentOrders.length > 0 ? (
                <div className="table-responsive">
                  <table className="table table-hover mb-0 align-middle">
                    <thead className="table-light">
                      <tr>
                        <th>Order #</th>
                        <th>Customer</th>
                        <th>Status</th>
                        <th>Payment</th>
                        <th className="text-end">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stats.recentOrders.map((o) => (
                        <tr key={o.id} onClick={() => window.location.href = `/orders/${o.id}`} style={{ cursor: "pointer" }}>
                          <td className="fw-semibold">{o.order_number}</td>
                          <td>{o.profiles?.[0]?.full_name ?? "—"}</td>
                          <td><span className={`badge ${STATUS_BADGES[o.status] ?? "bg-secondary"}`}>{o.status}</span></td>
                          <td><span className={`badge ${o.payment_status === "paid" ? "bg-success" : "bg-warning text-dark"}`}>{o.payment_status}</span></td>
                          <td className="text-end fw-medium"><Sensitive visible={visible}>₹{Number(o.total_amount).toLocaleString()}</Sensitive></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-muted text-center py-4 mb-0">No orders yet</p>
              )}
            </div>
          </div>
        </div>

        <div className="col-lg-4">
          <div className="card">
            <div className="card-body">
              <h6 className="card-title fw-semibold mb-3">Order Status</h6>
              {statusLabels.length > 0 ? (
                <ApexChart
                  options={pieOptions}
                  series={statusValues}
                  type="donut"
                  height={280}
                />
              ) : (
                <p className="text-muted text-center py-5">No order data yet</p>
              )}
            </div>
          </div>

          <div className="card mt-3">
            <div className="card-body">
              <h6 className="card-title fw-semibold mb-3">Low Stock Alerts</h6>
              {stats.lowStock.length > 0 ? (
                <div style={{ maxHeight: 240, overflowY: "auto" }}>
                  {stats.lowStock.map((item) => (
                    <div key={item.id} className="d-flex justify-content-between align-items-center py-2 border-bottom" style={{ fontSize: "0.85rem" }}>
                      <div>
                        <div className="fw-medium">{item.name}</div>
                        <small className="text-muted">SKU: {item.sku ?? "N/A"}</small>
                      </div>
                      <span className="badge bg-danger-subtle text-danger">{item.stock_quantity} left</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-muted text-center py-4">All stock levels are healthy</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ title, value, icon, color, href }: { title: string; value: string | number | ReactNode; icon: string; color: string; href: string }) {
  return (
    <div className="col-sm-6 col-xl-4">
      <Link href={href} className="text-decoration-none">
        <div className="card border-0 shadow-sm h-100">
          <div className="card-body d-flex align-items-center gap-3">
            <div className="d-flex align-items-center justify-content-center rounded-circle" style={{ width: 48, height: 48, backgroundColor: color + "15", color }}>
              <Icon icon={icon} width={24} />
            </div>
            <div>
              <div className="text-muted" style={{ fontSize: "0.8rem" }}>{title}</div>
              <div className="fw-bold" style={{ fontSize: "1.3rem" }}>{value}</div>
            </div>
          </div>
        </div>
      </Link>
    </div>
  );
}
