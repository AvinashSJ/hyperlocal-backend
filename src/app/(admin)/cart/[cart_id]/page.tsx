import Link from "next/link";
import { Icon } from "@iconify/react";
import { requirePermission, getActionPermissions } from "@/lib/require-permission";
import { getCartGroup } from "./actions";
import CartGroupClient from "./CartGroupClient";

/**
 * P54: /cart/[cart_id] admin page. Renders all orders that share a
 * single cart_id (multi-store checkouts split into N orders at
 * checkout time, all sharing the same cart_id).
 *
 * The page is super-admin + manager + staff (read/write per the
 * existing orders:view / orders:edit / orders:delete permissions
 * inherited from the embedded OrderActionControls). Role-gating
 * for sub-order visibility is enforced server-side in getCartGroup
 * (manager/staff only see their store's sub-orders).
 */
export default async function CartGroupPage(props: {
  params: Promise<{ cart_id: string }>;
}) {
  const { cart_id } = await props.params;
  // P57: combine orders + invoices action perms so each sub-order
  // card's [Generate Invoice] retry button shows only for callers
  // who can actually use it.
  const { permissions } = await requirePermission("orders", "view");
  const ordersActionPerms = getActionPermissions(permissions, "orders");
  const invoicesActionPerms = getActionPermissions(permissions, "invoices");
  const actionPerms = { ...ordersActionPerms, ...invoicesActionPerms };
  const cart = await getCartGroup(cart_id);

  if (!cart) {
    return (
      <div className="text-center py-5">
        <Icon icon="ri:shopping-cart-line" style={{ fontSize: 48 }} className="text-muted mb-2" />
        <h5 className="text-muted">Cart not found</h5>
        <p className="text-muted small">
          The cart_id <code>{cart_id}</code> has no orders, or the orders belong to a
          store you don&apos;t have access to.
        </p>
        <Link href="/orders" className="btn btn-link">
          <Icon icon="ri:arrow-left-line" className="me-1" />
          Back to Orders
        </Link>
      </div>
    );
  }

  return (
    <div>
      <div className="d-flex flex-wrap align-items-center mb-3 gap-2">
        <Link href="/orders" className="btn btn-link p-0 text-decoration-none">
          <Icon icon="ri:arrow-left-line" className="me-1" />
          Orders
        </Link>
        <span className="text-muted">/</span>
        <h5 className="mb-0">Cart #{cart.cart_id.slice(0, 8)}</h5>
        <span className="badge bg-info bg-opacity-10 text-info">
          {cart.orders.length} order{cart.orders.length === 1 ? "" : "s"}
        </span>
      </div>
      <CartGroupClient cart={cart} actionPerms={actionPerms} />
    </div>
  );
}
