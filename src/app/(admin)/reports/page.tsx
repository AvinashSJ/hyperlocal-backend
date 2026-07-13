import { requirePermission } from "@/lib/require-permission";
import { getStoreScope } from "@/lib/store-scope";
import {
  getRevenueSummary,
  getRevenueByStore,
  getRevenueByMethod,
  getMonthlyRevenue,
  getGSTSummary,
  getGSTMonthly,
  getGSTByHSN,
  getGSTByStore,
  getPnLSummary,
  getProductSales,
  getGSTFiling,
} from "./actions";
import ReportsClient from "./ReportsClient";

export default async function ReportsPage() {
  const perm = await requirePermission("reports", "view");
  const scope = await getStoreScope();

  const revenueSummary = await getRevenueSummary(null, null, scope.storeId);
  const revenueByStore = perm.isSuperAdmin ? await getRevenueByStore(null, null) : [];
  const revenueByMethod = await getRevenueByMethod(null, null, scope.storeId);
  const monthlyRevenue = await getMonthlyRevenue(null, null, scope.storeId);

  const gstSummary = await getGSTSummary(null, null, scope.storeId);
  const gstMonthly = await getGSTMonthly(null, null, scope.storeId);
  const gstByHSN = await getGSTByHSN(null, null, scope.storeId);
  const gstByStore = perm.isSuperAdmin ? await getGSTByStore(null, null) : [];

  const pnl = await getPnLSummary(null, null, scope.storeId);
  const productSales = await getProductSales(null, null, scope.storeId);
  const gstFiling = await getGSTFiling(null, null, scope.storeId);

  return (
    <ReportsClient
      storeId={scope.storeId}
      initial={{
        revenueSummary,
        revenueByStore,
        revenueByMethod,
        monthlyRevenue,
        gstSummary,
        gstMonthly,
        gstByHSN,
        gstByStore,
        pnl,
        productSales,
        gstFiling,
      }}
    />
  );
}
