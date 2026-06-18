import { getStoreScope } from "@/lib/store-scope";
import DashboardClient from "./DashboardClient";
import { getDashboardStats } from "./actions";

export default async function DashboardPage() {
  const { storeId } = await getStoreScope();
  const stats = await getDashboardStats(storeId);
  return <DashboardClient stats={stats} />;
}
