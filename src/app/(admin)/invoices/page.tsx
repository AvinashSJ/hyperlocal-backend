import { requirePermission } from "@/lib/require-permission";
import { getInvoices } from "./actions";
import { getStoreScope } from "@/lib/store-scope";
import InvoicesClient from "./InvoicesClient";

export default async function InvoicesPage() {
  await requirePermission("invoices", "view");
  const { storeId } = await getStoreScope();
  const invoices = await getInvoices(storeId);
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
