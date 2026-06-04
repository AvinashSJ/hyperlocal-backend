import { getInvoice } from "../actions";
import InvoiceDetailClient from "./InvoiceDetailClient";

export default async function InvoiceDetailPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const invoice = await getInvoice(id);
  return (
    <div>
      <InvoiceDetailClient invoice={invoice} />
    </div>
  );
}
