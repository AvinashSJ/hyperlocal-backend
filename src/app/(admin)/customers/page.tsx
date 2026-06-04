import { requirePermission } from "@/lib/require-permission";
import { getCustomers } from "./actions";
import { getStoreScope } from "@/lib/store-scope";
import CustomersClient from "./CustomersClient";

export default async function CustomersPage() {
  await requirePermission("customers", "view");
  const { storeId } = await getStoreScope();
  const customers = await getCustomers(storeId);

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
