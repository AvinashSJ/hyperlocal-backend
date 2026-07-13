import { requirePermission } from "@/lib/require-permission";
import { getStoreScope } from "@/lib/store-scope";
import DashboardClient from "./DashboardClient";
import { getDashboardStats } from "./actions";

export default async function DashboardPage() {
  await requirePermission("dashboard", "view");
  const { storeId } = await getStoreScope();
  const stats = await getDashboardStats(storeId);
  return <DashboardClient stats={stats} />;
}
