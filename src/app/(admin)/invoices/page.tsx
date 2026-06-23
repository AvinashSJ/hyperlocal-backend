import { redirect } from "next/navigation";
import { requirePermission } from "@/lib/require-permission";
import { getInvoices } from "./actions";
import { getStoreScope, UnassignedStoreError, assertStoreScope } from "@/lib/store-scope";
import InvoicesClient from "./InvoicesClient";

export default async function InvoicesPage() {
  await requirePermission("invoices", "view");
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
  const invoices = await getInvoices(scope.storeId);
  return (
    <div>
      <h4 className="fw-bold mb-4">Invoices</h4>
      <div className="card">
        <div className="card-body">
          <InvoicesClient invoices={invoices} />
        </div>
      </div>
    </div>
  );
}
