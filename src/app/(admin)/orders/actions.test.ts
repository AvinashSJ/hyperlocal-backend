import { describe, it, expect, beforeEach } from "vitest";
import "../../../../test/mocks/supabase-clients";
import "../../../../test/mocks/next-cache";
import "../../../../test/mocks/next-navigation";
import "../../../../test/mocks/require-permission";
import {
  getAdminClient,
  resetSupabaseClients,
} from "../../../../test/mocks/supabase-clients";
import { revalidatePathMock } from "../../../../test/mocks/next-cache";
import {
  asAdmin,
  asSuperAdmin,
  asAnonymous,
  resetPermissionMock,
  assertPermissionMock,
  PermissionError,
} from "../../../../test/mocks/require-permission";
import { makeOrder } from "../../../../test/fixtures/factories";

import {
  getOrders,
  getOrder,
  updateOrderStatus,
  updatePaymentStatus,
  deleteOrder,
  type OrderStatus,
  type PaymentStatus,
} from "./actions";

beforeEach(() => {
  resetSupabaseClients();
  resetPermissionMock();
  revalidatePathMock.mockClear();
  assertPermissionMock.mockClear();
});

describe("getOrders", () => {
  it("returns the full list when no storeId is provided", async () => {
    asSuperAdmin();
    const admin = getAdminClient();
    admin.enqueueResponse({ data: [makeOrder(), makeOrder({ id: "o-2" })], error: null });

    const result = await getOrders();
    expect(result).toHaveLength(2);
  });

  it("filters by storeId when provided", async () => {
    asSuperAdmin();
    const admin = getAdminClient();
    admin.enqueueResponse({ data: [makeOrder({ store_id: "s-1" })], error: null });

    const result = await getOrders("s-1");
    expect(result).toHaveLength(1);
    // Assert the filter was applied by inspecting the chain calls
    const ordersChains = getAdminClient().chainsForTable("orders");
    const filterChain = ordersChains[0];
    expect(filterChain.some((c) => c.method === "eq" && c.args[0] === "store_id" && c.args[1] === "s-1")).toBe(true);
  });

  it("returns empty array when data is null", async () => {
    asSuperAdmin();
    const admin = getAdminClient();
    admin.enqueueResponse({ data: null, error: null });

    const result = await getOrders();
    expect(result).toEqual([]);
  });

  it("throws when supabase returns an error", async () => {
    asSuperAdmin();
    const admin = getAdminClient();
    admin.enqueueResponse({ data: null, error: { message: "db boom" } });

    await expect(getOrders()).rejects.toThrow("db boom");
  });
});

describe("getOrder", () => {
  it("returns a single order with relations", async () => {
    asSuperAdmin();
    const order = makeOrder({ id: "o-1" });
    const admin = getAdminClient();
    admin.enqueueResponse({ data: order, error: null });

    const result = await getOrder("o-1");
    expect(result.id).toBe("o-1");
  });

  it("throws when the order is not found", async () => {
    asSuperAdmin();
    const admin = getAdminClient();
    admin.enqueueResponse({
      data: null,
      error: { message: "No rows found", code: "PGRST116" },
    });

    await expect(getOrder("missing")).rejects.toThrow("No rows found");
  });

  // P26: the order_items snapshot fields (product_name, product_sku,
  // variant_name, product_hsn_code) are returned alongside the products JOIN
  // so the order detail page can show the product name even after the
  // product has been deleted.
  it("P26: getOrder returns order_items snapshot fields (product_name, variant_name, etc.)", async () => {
    asSuperAdmin();
    // Build the order inline (makeOrder doesn't expose order_items)
    const order = {
      ...makeOrder({ id: "o-1" }),
      order_items: [{
        id: "oi-1",
        product_id: "p-1",
        variant_id: null,
        quantity: 2,
        unit_price: 50,
        total_price: 100,
        gst_rate: 18,
        gst_amount: 18,
        status: "pending" as const,
        // P26: snapshot fields present on the row
        product_name: "Santoor Soap 80g",
        product_sku: "SNT-80",
        variant_name: null,
        product_hsn_code: "3401",
        products: null, // product is deleted — JOIN returns null
        product_variants: null,
      }],
    };
    const admin = getAdminClient();
    admin.enqueueResponse({ data: order, error: null });

    const result = await getOrder("o-1");
    expect(result.order_items[0].product_name).toBe("Santoor Soap 80g");
    expect(result.order_items[0].product_sku).toBe("SNT-80");
    expect(result.order_items[0].product_hsn_code).toBe("3401");
    // The products JOIN is null (product was deleted), but the snapshot survives
    expect(result.order_items[0].products).toBeNull();
  });
});

describe("updateOrderStatus", () => {
  it("rejects anonymous callers via PermissionError", async () => {
    asAnonymous();
    await expect(updateOrderStatus("o-1", "confirmed")).rejects.toBeInstanceOf(PermissionError);
  });

  it("rejects users without orders:edit permission", async () => {
    asAdmin({ orders: ["view"] });
    await expect(updateOrderStatus("o-1", "confirmed")).rejects.toBeInstanceOf(PermissionError);
  });

  it("updates status, inserts a track row, and revalidates the list + detail", async () => {
    asAdmin({ orders: ["edit"] });
    const admin = getAdminClient();
    admin.enqueueResponse({ data: null, error: null }); // orders.update
    admin.enqueueResponse({ data: null, error: null }); // order_tracks.insert

    await updateOrderStatus("o-1", "processing");

    const updateChain = admin.chainsForTable("orders")[0];
    expect(updateChain[0]).toEqual({ method: "from", args: ["orders"] });
    expect(updateChain.find((c) => c.method === "update")).toBeDefined();
    expect(updateChain.find((c) => c.method === "eq")).toEqual({
      method: "eq",
      args: ["id", "o-1"],
    });

    const updateArg = updateChain.find((c) => c.method === "update")!.args[0] as Record<string, unknown>;
    expect(updateArg.status).toBe("processing");
    expect(updateArg.confirmed_at).toBeUndefined();
    expect(updateArg.delivered_at).toBeUndefined();

    const trackChain = admin.chainsForTable("order_tracks")[0];
    const insertArg = trackChain.find((c) => c.method === "insert")!.args[0] as Record<string, unknown>;
    expect(insertArg.order_id).toBe("o-1");
    expect(insertArg.status).toBe("processing");
    expect(insertArg.notes).toBeNull();

    expect(revalidatePathMock).toHaveBeenCalledWith("/orders");
    expect(revalidatePathMock).toHaveBeenCalledWith("/orders/o-1");
  });

  it("sets confirmed_at timestamp when status is 'confirmed'", async () => {
    asAdmin({ orders: ["edit"] });
    const admin = getAdminClient();
    admin.enqueueResponse({ data: null, error: null });
    admin.enqueueResponse({ data: null, error: null });

    await updateOrderStatus("o-1", "confirmed");

    const updateArg = admin.chainsForTable("orders")[0]
      .find((c) => c.method === "update")!.args[0] as Record<string, unknown>;
    expect(updateArg.status).toBe("confirmed");
    expect(typeof updateArg.confirmed_at).toBe("string");
    expect(updateArg.delivered_at).toBeUndefined();
  });

  it("sets delivered_at timestamp when status is 'delivered'", async () => {
    asAdmin({ orders: ["edit"] });
    const admin = getAdminClient();
    admin.enqueueResponse({ data: null, error: null });
    admin.enqueueResponse({ data: null, error: null });

    await updateOrderStatus("o-1", "delivered");

    const updateArg = admin.chainsForTable("orders")[0]
      .find((c) => c.method === "update")!.args[0] as Record<string, unknown>;
    expect(updateArg.status).toBe("delivered");
    expect(typeof updateArg.delivered_at).toBe("string");
    expect(updateArg.confirmed_at).toBeUndefined();
  });

  it("does NOT set any timestamp for non-terminal statuses", async () => {
    asAdmin({ orders: ["edit"] });
    const admin = getAdminClient();
    const statuses: OrderStatus[] = ["pending", "shipped", "cancelled", "returned"];

    for (const status of statuses) {
      admin.enqueueResponse({ data: null, error: null });
      admin.enqueueResponse({ data: null, error: null });

      await updateOrderStatus("o-1", status);

      const orderChains = admin.chainsForTable("orders");
      const lastOrderChain = orderChains[orderChains.length - 1];
      const updateArg = lastOrderChain.find((c) => c.method === "update")!.args[0] as Record<string, unknown>;
      expect(updateArg.confirmed_at).toBeUndefined();
      expect(updateArg.delivered_at).toBeUndefined();
    }
  });

  it("passes notes through to the tracking row", async () => {
    asAdmin({ orders: ["edit"] });
    const admin = getAdminClient();
    admin.enqueueResponse({ data: null, error: null });
    admin.enqueueResponse({ data: null, error: null });

    await updateOrderStatus("o-1", "shipped", "Left the warehouse");

    const trackInsert = admin.chainsForTable("order_tracks")[0]
      .find((c) => c.method === "insert")!.args[0] as Record<string, unknown>;
    expect(trackInsert.notes).toBe("Left the warehouse");
  });

  it("throws when the order update fails", async () => {
    asAdmin({ orders: ["edit"] });
    const admin = getAdminClient();
    admin.enqueueResponse({ data: null, error: { message: "update failed" } });

    await expect(updateOrderStatus("o-1", "processing")).rejects.toThrow("update failed");
  });

  it("throws when the tracking insert fails", async () => {
    asAdmin({ orders: ["edit"] });
    const admin = getAdminClient();
    admin.enqueueResponse({ data: null, error: null });
    admin.enqueueResponse({ data: null, error: { message: "track insert failed" } });

    await expect(updateOrderStatus("o-1", "processing")).rejects.toThrow("track insert failed");
  });
});

describe("updatePaymentStatus", () => {
  it("rejects users without orders:edit permission", async () => {
    asAdmin({ orders: ["view"] });
    await expect(updatePaymentStatus("o-1", "paid")).rejects.toBeInstanceOf(PermissionError);
  });

  it("updates payment_status, revalidates list and detail", async () => {
    asAdmin({ orders: ["edit"] });
    const admin = getAdminClient();
    admin.enqueueResponse({ data: null, error: null });

    await updatePaymentStatus("o-1", "paid");

    const updateArg = admin.chainsForTable("orders")[0]
      .find((c) => c.method === "update")!.args[0] as Record<string, unknown>;
    expect(updateArg).toEqual({ payment_status: "paid" });

    expect(revalidatePathMock).toHaveBeenCalledWith("/orders");
    expect(revalidatePathMock).toHaveBeenCalledWith("/orders/o-1");
  });

  it.each<PaymentStatus>(["unpaid", "paid", "refunded", "partially_refunded"])(
    "accepts payment_status '%s'",
    async (status) => {
      asAdmin({ orders: ["edit"] });
      const admin = getAdminClient();
      admin.enqueueResponse({ data: null, error: null });
      await updatePaymentStatus("o-1", status);
      const updateArg = admin.chainsForTable("orders")[0]
        .find((c) => c.method === "update")!.args[0] as Record<string, unknown>;
      expect(updateArg.payment_status).toBe(status);
    },
  );

  it("throws when the update fails", async () => {
    asAdmin({ orders: ["edit"] });
    const admin = getAdminClient();
    admin.enqueueResponse({ data: null, error: { message: "db error" } });

    await expect(updatePaymentStatus("o-1", "paid")).rejects.toThrow("db error");
  });
});

describe("deleteOrder", () => {
  it("rejects users without orders:delete permission", async () => {
    asAdmin({ orders: ["view", "edit"] });
    await expect(deleteOrder("o-1")).rejects.toBeInstanceOf(PermissionError);
  });

  it("cascades deletion: order_tracks, order_items, invoices, then orders", async () => {
    asSuperAdmin();
    const admin = getAdminClient();
    admin.enqueueResponse({ data: null, error: null });
    admin.enqueueResponse({ data: null, error: null });
    admin.enqueueResponse({ data: null, error: null });
    admin.enqueueResponse({ data: null, error: null });

    await deleteOrder("o-1");

    const tablesTouched = admin.calls
      .filter((c) => c.method === "from")
      .map((c) => c.args[0]);
    expect(tablesTouched).toEqual([
      "order_tracks",
      "order_items",
      "invoices",
      "orders",
    ]);
  });

  it("revalidates /orders after deletion", async () => {
    asSuperAdmin();
    const admin = getAdminClient();
    admin.enqueueResponse({ data: null, error: null });
    admin.enqueueResponse({ data: null, error: null });
    admin.enqueueResponse({ data: null, error: null });
    admin.enqueueResponse({ data: null, error: null });

    await deleteOrder("o-1");
    expect(revalidatePathMock).toHaveBeenCalledWith("/orders");
  });

  it("throws when the final orders.delete fails", async () => {
    asSuperAdmin();
    const admin = getAdminClient();
    admin.enqueueResponse({ data: null, error: null });
    admin.enqueueResponse({ data: null, error: null });
    admin.enqueueResponse({ data: null, error: null });
    admin.enqueueResponse({ data: null, error: { message: "delete failed" } });

    await expect(deleteOrder("o-1")).rejects.toThrow("delete failed");
  });
});

describe("deleteOrder — superadmin-only restriction (P16 Feature A)", () => {
  // P16: User requested "Store manager shouldn't be able to delete orders,
  // whereas superadmin can delete the orders." The Manager role's `orders`
  // permission no longer includes `delete` (migration 20260619000004).
  // Additionally, `deleteOrder` checks `isSuperAdmin` after `assertPermission`
  // as defense-in-depth: custom roles created via the Roles UI cannot grant
  // order-delete power to non-Super-Admin users.

  it("rejects Manager role even if `delete` is in their orders permission (hard restriction)", async () => {
    // Simulates a hypothetical state where a custom role somehow has the
    // `delete` permission. The action must still reject because the user is
    // not a Super Admin.
    asAdmin({ orders: ["view", "create", "edit", "delete"] }, { role: "Manager" });
    await expect(deleteOrder("o-1")).rejects.toBeInstanceOf(PermissionError);
  });

  it("rejects Staff role even if `delete` is in their orders permission", async () => {
    asAdmin({ orders: ["view", "create", "edit", "delete"] }, { role: "Staff" });
    await expect(deleteOrder("o-1")).rejects.toBeInstanceOf(PermissionError);
  });

  it("allows Super Admin to delete orders", async () => {
    asSuperAdmin();
    const admin = getAdminClient();
    admin.enqueueResponse({ data: null, error: null });
    admin.enqueueResponse({ data: null, error: null });
    admin.enqueueResponse({ data: null, error: null });
    admin.enqueueResponse({ data: null, error: null });

    await expect(deleteOrder("o-1")).resolves.not.toThrow();

    const tablesTouched = admin.calls
      .filter((c) => c.method === "from")
      .map((c) => c.args[0]);
    expect(tablesTouched).toEqual([
      "order_tracks",
      "order_items",
      "invoices",
      "orders",
    ]);
  });
});
