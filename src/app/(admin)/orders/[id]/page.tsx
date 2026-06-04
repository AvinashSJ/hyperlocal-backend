import { getOrder } from "../actions";
import OrderDetailClient from "./OrderDetailClient";

export default async function OrderDetailPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const order = await getOrder(id);
  return (
    <div>
      <OrderDetailClient order={order} />
    </div>
  );
}
