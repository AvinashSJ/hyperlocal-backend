import { describe, it, expect, beforeEach, vi } from "vitest";
import "../../../../../test/mocks/supabase-clients";
import "../../../../../test/mocks/next-cache";
import "../../../../../test/mocks/next-navigation";
import "../../../../../test/mocks/require-permission";
import {
  getAdminClient,
  getServerClient,
  resetSupabaseClients,
  setServerUser,
} from "../../../../../test/mocks/supabase-clients";
import {
  asAdmin,
  asSuperAdmin,
  resetPermissionMock,
  PermissionError,
} from "../../../../../test/mocks/require-permission";
import { getCartGroup } from "./actions";

beforeEach(() => {
  resetSupabaseClients();
  resetPermissionMock();
});

describe("getCartGroup (P54)", () => {
  it("returns null when the cart_id has no orders", async () => {
    asSuperAdmin();
    const admin = getAdminClient();
    admin.enqueueResponse({ data: [], error: null });

    const result = await getCartGroup("cart-unknown");
    expect(result).toBeNull();
  });

  it("returns all orders under the cart_id, joined with stores and profile", async () => {
    asSuperAdmin();
    const server = getServerClient();
    setServerUser({ id: "u-1", email: "alice@test.com" });
    const admin = getAdminClient();
    admin.enqueueResponse({
      data: [
        {
          id: "o-1",
          order_number: "ORD-001",
          status: "delivered",
          payment_status: "paid",
          payment_method: "upi",
          subtotal: 1000,
          discount_amount: 0,
          tax_amount: 0,
          delivery_charge: 40,
          total_amount: 1040,
          placed_at: "2026-06-24T10:00:00.000Z",
          store_id: "s-1",
          invoice_id: "i-1",
          user_id: "u-1",
          delivery_address_id: "a-1",
          delivery_slot_id: "slot-1",
          delivery_date: "2026-06-25",
          order_items: [{ id: "oi-1" }, { id: "oi-2" }],
          profiles: { full_name: "Alice", phone: "98765", email: "a@x.com" },
          stores: { name: "FreshCart", code: "FCD" },
          addresses: {
            full_name: "Alice",
            phone: "98765",
            address_line1: "12 Main St",
            address_line2: null,
            landmark: null,
            city: "Mumbai",
            state: "MH",
            pincode: "400001",
          },
        },
        {
          id: "o-2",
          order_number: "ORD-002",
          status: "pending",
          payment_status: "unpaid",
          payment_method: "upi",
          subtotal: 500,
          discount_amount: 0,
          tax_amount: 0,
          delivery_charge: 40,
          total_amount: 540,
          placed_at: "2026-06-24T10:00:01.000Z",
          store_id: "s-2",
          invoice_id: null,
          user_id: "u-1",
          delivery_address_id: "a-1",
          delivery_slot_id: "slot-1",
          delivery_date: "2026-06-25",
          order_items: [{ id: "oi-3" }],
          profiles: { full_name: "Alice", phone: "98765", email: "a@x.com" },
          stores: { name: "GreenMart", code: "GM" },
          addresses: {
            full_name: "Alice",
            phone: "98765",
            address_line1: "12 Main St",
            address_line2: null,
            landmark: null,
            city: "Mumbai",
            state: "MH",
            pincode: "400001",
          },
        },
      ],
      error: null,
    });

    const result = await getCartGroup("cart-abc");
    expect(result).not.toBeNull();
    expect(result!.cart_id).toBe("cart-abc");
    expect(result!.orders).toHaveLength(2);
    expect(result!.orders[0].id).toBe("o-1");
    expect(result!.orders[0].item_count).toBe(2);
    expect(result!.orders[0].stores?.name).toBe("FreshCart");
    expect(result!.orders[1].id).toBe("o-2");
    expect(result!.orders[1].item_count).toBe(1);
    expect(result!.orders[1].stores?.name).toBe("GreenMart");
    expect(result!.customer?.full_name).toBe("Alice");
    expect(result!.delivery_address?.city).toBe("Mumbai");
    expect(result!.delivery_slot_id).toBe("slot-1");
    expect(result!.delivery_date).toBe("2026-06-25");
    expect(result!.payment_method).toBe("upi");
    // total is sum of order totals
    expect(result!.total).toBe(1040 + 540);
  });

  it("aggregates (order, item) join rows back to one row per order (item_count is correct)", async () => {
    asSuperAdmin();
    const server = getServerClient();
    setServerUser({ id: "u-1", email: "a@x.com" });
    const admin = getAdminClient();
    // 3 items in order 1, 1 item in order 2 — 4 rows total because of the
    // 1:N order_items join. The action must dedup.
    admin.enqueueResponse({
      data: [
        {
          id: "o-1", order_number: "ORD-001", status: "pending", payment_status: "unpaid",
          payment_method: "cod", subtotal: 100, discount_amount: 0, tax_amount: 0, delivery_charge: 0,
          total_amount: 100, placed_at: "2026-06-24T10:00:00.000Z", store_id: "s-1",
          invoice_id: null, user_id: "u-1", delivery_address_id: null,
          delivery_slot_id: null, delivery_date: null,
          order_items: [{ id: "oi-1" }],
          profiles: { full_name: "A", phone: null, email: null },
          stores: { name: "S1", code: "S1" }, addresses: null,
        },
        {
          id: "o-1", order_number: "ORD-001", status: "pending", payment_status: "unpaid",
          payment_method: "cod", subtotal: 100, discount_amount: 0, tax_amount: 0, delivery_charge: 0,
          total_amount: 100, placed_at: "2026-06-24T10:00:00.000Z", store_id: "s-1",
          invoice_id: null, user_id: "u-1", delivery_address_id: null,
          delivery_slot_id: null, delivery_date: null,
          order_items: [{ id: "oi-2" }],
          profiles: { full_name: "A", phone: null, email: null },
          stores: { name: "S1", code: "S1" }, addresses: null,
        },
        {
          id: "o-1", order_number: "ORD-001", status: "pending", payment_status: "unpaid",
          payment_method: "cod", subtotal: 100, discount_amount: 0, tax_amount: 0, delivery_charge: 0,
          total_amount: 100, placed_at: "2026-06-24T10:00:00.000Z", store_id: "s-1",
          invoice_id: null, user_id: "u-1", delivery_address_id: null,
          delivery_slot_id: null, delivery_date: null,
          order_items: [{ id: "oi-3" }],
          profiles: { full_name: "A", phone: null, email: null },
          stores: { name: "S1", code: "S1" }, addresses: null,
        },
        {
          id: "o-2", order_number: "ORD-002", status: "pending", payment_status: "unpaid",
          payment_method: "cod", subtotal: 50, discount_amount: 0, tax_amount: 0, delivery_charge: 0,
          total_amount: 50, placed_at: "2026-06-24T10:00:01.000Z", store_id: "s-2",
          invoice_id: null, user_id: "u-1", delivery_address_id: null,
          delivery_slot_id: null, delivery_date: null,
          order_items: [{ id: "oi-4" }],
          profiles: { full_name: "A", phone: null, email: null },
          stores: { name: "S2", code: "S2" }, addresses: null,
        },
      ],
      error: null,
    });

    const result = await getCartGroup("cart-abc");
    expect(result).not.toBeNull();
    expect(result!.orders).toHaveLength(2);
    const o1 = result!.orders.find((o) => o.id === "o-1")!;
    const o2 = result!.orders.find((o) => o.id === "o-2")!;
    expect(o1.item_count).toBe(3);
    expect(o2.item_count).toBe(1);
  });

  it("filters by store_id when the caller is a Manager (store-scoped)", async () => {
    asAdmin({ orders: ["view"] }, { role: "Manager", storeId: "s-1" });
    const server = getServerClient();
    setServerUser({ id: "u-mgr", email: "mgr@x.com" });
    const admin = getAdminClient();
    // Queue 3 responses: getStoreScope reads profile (server client)
    // and role (admin client), then the orders query. We only care
    // about the orders query's chain shape here.
    admin.enqueueResponse({ data: null, error: null }); // 1) role lookup (admin)
    admin.enqueueResponse({ data: [], error: null }); // 2) orders query (admin)
    // The server client profiles lookup runs in parallel via
    // getStoreScope. The mock doesn't share queues across clients.
    server.enqueueResponse({ data: { store_id: "s-1", role_id: 2 }, error: null });

    const result = await getCartGroup("cart-abc");
    expect(result).toBeNull();

    // The orders query chain must include the store_id filter.
    const ordersChains = admin.chainsForTable("orders");
    expect(ordersChains.length).toBeGreaterThanOrEqual(1);
    const storeEq = ordersChains[0].find(
      (c) => c.method === "eq" && c.args[0] === "store_id" && c.args[1] === "s-1",
    );
    expect(storeEq).toBeDefined();
  });

  it("rejects anonymous callers via PermissionError", async () => {
    const admin = getAdminClient();
    await expect(getCartGroup("cart-abc")).rejects.toBeInstanceOf(PermissionError);
    expect(admin.calls.filter((c) => c.method === "from").length).toBe(0);
  });
});
