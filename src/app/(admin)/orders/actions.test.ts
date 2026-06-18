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
    asAdmin({ orders: ["delete"] });
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
    asAdmin({ orders: ["delete"] });
    const admin = getAdminClient();
    admin.enqueueResponse({ data: null, error: null });
    admin.enqueueResponse({ data: null, error: null });
    admin.enqueueResponse({ data: null, error: null });
    admin.enqueueResponse({ data: null, error: null });

    await deleteOrder("o-1");
    expect(revalidatePathMock).toHaveBeenCalledWith("/orders");
  });

  it("throws when the final orders.delete fails", async () => {
    asAdmin({ orders: ["delete"] });
    const admin = getAdminClient();
    admin.enqueueResponse({ data: null, error: null });
    admin.enqueueResponse({ data: null, error: null });
    admin.enqueueResponse({ data: null, error: null });
    admin.enqueueResponse({ data: null, error: { message: "delete failed" } });

    await expect(deleteOrder("o-1")).rejects.toThrow("delete failed");
  });
});
