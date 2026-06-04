import { createAdminClient } from "@/lib/supabase/admin";
import { getStoreScope } from "@/lib/store-scope";
import DashboardClient from "./DashboardClient";

type MonthlyData = { month: string; total: number };
type LowStockItem = {
  id: string; name: string; sku: string | null;
  stock_quantity: number; low_stock_threshold: number | null;
};
type RecentOrder = {
  id: string; order_number: string; status: string;
  total_amount: number; payment_status: string; placed_at: string;
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

async function getStats(storeId?: string | null): Promise<Stats> {
  const supabase = createAdminClient();
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  let productQ = supabase.from("products").select("*", { count: "exact", head: true }).eq("status", "active");
  let orderQ = supabase.from("orders").select("*", { count: "exact", head: true });
  let revenueQ = supabase.from("orders").select("total_amount").eq("payment_status", "paid");
  let todayOrderQ = supabase.from("orders").select("*", { count: "exact", head: true }).gte("created_at", todayStart.toISOString());
  let todayRevenueQ = supabase.from("orders").select("total_amount").eq("payment_status", "paid").gte("created_at", todayStart.toISOString());
  let recentQ = supabase.from("orders").select("id, order_number, status, total_amount, payment_status, placed_at, profiles(full_name)").order("placed_at", { ascending: false }).limit(5);
  let statusQ = supabase.from("orders").select("status").not("status", "is", null);
  let lowStockQ = supabase.from("products").select("id, name, sku, stock_quantity, low_stock_threshold").lt("stock_quantity", 10).order("stock_quantity", { ascending: true }).limit(5);

  if (storeId) {
    productQ = productQ.eq("store_id", storeId);
    orderQ = orderQ.eq("store_id", storeId);
    revenueQ = revenueQ.eq("store_id", storeId);
    todayOrderQ = todayOrderQ.eq("store_id", storeId);
    todayRevenueQ = todayRevenueQ.eq("store_id", storeId);
    recentQ = recentQ.eq("store_id", storeId);
    statusQ = statusQ.eq("store_id", storeId);
    lowStockQ = lowStockQ.eq("store_id", storeId);
  }

  const [
    { count: productCount },
    { count: orderCount },
    { count: customerCount },
    { data: revenueData },
    { data: lowStock },
    { count: todayOrders },
    { data: todayRevenueData },
    { data: recentOrders },
    { data: statusBreakdown },
  ] = await Promise.all([
    productQ,
    orderQ,
    supabase.from("profiles").select("*", { count: "exact", head: true }).eq("role", "customer"),
    revenueQ,
    lowStockQ,
    todayOrderQ,
    todayRevenueQ,
    recentQ,
    statusQ,
  ]);

  let monthlyData: MonthlyData[];
  if (storeId) {
    const { data: monthlyOrders } = await supabase
      .from("orders")
      .select("total_amount, placed_at")
      .eq("store_id", storeId)
      .gte("placed_at", new Date(new Date().getFullYear(), new Date().getMonth() - 11, 1).toISOString());
    const monthlyMap = new Map<string, number>();
    for (const o of monthlyOrders ?? []) {
      const month = new Date(o.placed_at).toLocaleString("default", { month: "short", year: "numeric" });
      monthlyMap.set(month, (monthlyMap.get(month) ?? 0) + Number(o.total_amount));
    }
    monthlyData = Array.from(monthlyMap.entries()).map(([month, total]) => ({ month, total }));
  } else {
    const { data: monthlyRaw } = await supabase.rpc("get_monthly_order_stats");
    monthlyData = monthlyRaw ?? [];
  }

  const totalRevenue = revenueData?.reduce((sum, o) => sum + Number(o.total_amount), 0) ?? 0;
  const todayRevenue = todayRevenueData?.reduce((sum, o) => sum + Number(o.total_amount), 0) ?? 0;

  const statusCounts: Record<string, number> = {};
  for (const o of statusBreakdown ?? []) {
    const s = o.status ?? "unknown";
    statusCounts[s] = (statusCounts[s] ?? 0) + 1;
  }

  return {
    productCount: productCount ?? 0,
    orderCount: orderCount ?? 0,
    customerCount: customerCount ?? 0,
    totalRevenue,
    monthlyData: monthlyData ?? [],
    lowStock: lowStock ?? [],
    todayOrders: todayOrders ?? 0,
    todayRevenue,
    recentOrders: recentOrders ?? [],
    statusBreakdown: statusCounts,
  };
}

export default async function DashboardPage() {
  const { storeId } = await getStoreScope();
  const stats = await getStats(storeId);
  return <DashboardClient stats={stats} />;
}
