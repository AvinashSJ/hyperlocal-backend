import { requirePermission } from "@/lib/require-permission";
import { getInvoice } from "../actions";
import InvoiceDetailClient from "./InvoiceDetailClient";

export default async function InvoiceDetailPage(props: { params: Promise<{ id: string }> }) {
  // P39: gate the page on invoices:view. Previously the detail
  // page had no permission check (only the list page did), so
  // anyone with the URL could load it. The action also checks
  // (defense in depth).
  await requirePermission("invoices", "view");
  const { id } = await props.params;
  const invoice = await getInvoice(id);
  return (
    <div>
      <InvoiceDetailClient invoice={invoice} />
    </div>
  );
}
