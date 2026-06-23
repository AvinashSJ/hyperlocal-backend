import { redirect } from "next/navigation";
import { requirePermission } from "@/lib/require-permission";
import { getCustomers } from "./actions";
import { getStoreScope, UnassignedStoreError, assertStoreScope } from "@/lib/store-scope";
import CustomersClient from "./CustomersClient";

export default async function CustomersPage() {
  await requirePermission("customers", "view");
  const scope = await getStoreScope();
  // P47: see orders/page.tsx for the rationale.
  try {
    assertStoreScope(scope);
  } catch (err) {
    if (err instanceof UnassignedStoreError) {
      redirect("/unassigned-store");
    }
    throw err;
  }
  const customers = await getCustomers(scope.storeId);

  return (
    <div>
      <h4 className="fw-bold mb-4">Customers</h4>
      <div className="card">
        <div className="card-body">
          <CustomersClient customers={customers} />
        </div>
      </div>
    </div>
  );
}
