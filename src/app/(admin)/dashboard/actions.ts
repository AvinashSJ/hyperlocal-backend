"use server";

import { createAdminClient } from "@/lib/supabase/admin";

export type MonthlyData = { month: string; total: number };
export type LowStockItem = {
  id: string;
  name: string;
  sku: string | null;
  stock_quantity: number;
  low_stock_threshold: number | null;
};
export type RecentOrder = {
  id: string;
  order_number: string;
  status: string;
  total_amount: number;
  payment_status: string;
  placed_at: string;
  profiles: { full_name: string | null } | null;
};

export type DashboardStats = {
  productCount: number;
  orderCount: number;
  customerCount: number;
  totalRevenue: number;
  monthlyData: MonthlyData[];
  lowStock: LowStockItem[];
  todayOrders: number;
  todayRevenue: number;
  recentOrders: RecentOrder[];
  statusBreakdown: Record<string, number>;
};

export async function getDashboardStats(storeId?: string | null): Promise<DashboardStats> {
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
    { data: revenueData },
    { data: lowStock },
    { count: todayOrders },
    { data: todayRevenueData },
    { data: recentOrders },
    { data: statusBreakdown },
  ] = await Promise.all([
    productQ,
    orderQ,
    revenueQ,
    lowStockQ,
    todayOrderQ,
    todayRevenueQ,
    recentQ,
    statusQ,
  ]);

  // P24: customer count is store-scoped. A customer's relationship to a
  // store is established by placing an order with that store_id, not by a
  // profiles.store_id value (which is for admin/staff, not customers).
  // Mirrors the getCustomers() pattern at customers/actions.ts:22-29.
  // - Super Admin (no storeId): count all `profiles` with role='customer'
  //   (global aggregate).
  // - Store-scoped (storeId): count distinct `user_id`s in the store's
  //   orders. This is "people who have ordered from this store" — same
  //   definition as the Customers page, regardless of order status.
  let customerCount = 0;
  if (storeId) {
    const { data: orderUsers } = await supabase
      .from("orders")
      .select("user_id")
      .eq("store_id", storeId);
    customerCount = new Set((orderUsers ?? []).map((o) => o.user_id)).size;
  } else {
    const { count } = await supabase
      .from("profiles")
      .select("*", { count: "exact", head: true })
      .eq("role", "customer");
    customerCount = count ?? 0;
  }

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
    recentOrders: (recentOrders ?? []) as unknown as RecentOrder[],
    statusBreakdown: statusCounts,
  };
}
