import { describe, it, expect, beforeEach, vi } from "vitest";
import "../../../../test/mocks/supabase-clients";
import "../../../../test/mocks/next-cache";
import "../../../../test/mocks/next-navigation";
import "../../../../test/mocks/require-permission";
import {
  getAdminClient,
  resetSupabaseClients,
  setServerUser,
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

  // P43: the orders list now joins with stores(name, code) so the
  // table can show which store each order belongs to.
  it("P43: returns the store name and code for each order", async () => {
    asSuperAdmin();
    const admin = getAdminClient();
    const o1 = makeOrder({ id: "o-1" });
    (o1 as { stores?: { name: string; code: string } | null }).stores = {
      name: "FreshCart",
      code: "A1B2C3D4",
    };
    const o2 = makeOrder({ id: "o-2" });
    // No store (legacy / orphaned).
    (o2 as { stores?: { name: string; code: string } | null }).stores = null;
    admin.enqueueResponse({ data: [o1, o2], error: null });

    const result = await getOrders();
    expect(result).toHaveLength(2);
    expect(result[0].stores).toEqual({ name: "FreshCart", code: "A1B2C3D4" });
    expect(result[1].stores).toBeNull();
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
    // "processing" triggers invoice-gen re-fetch (no invoices:create so it
    // will throw PermissionError, but the try/catch handles it).
    admin.enqueueResponse({ data: { invoice_id: null }, error: null });

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
      // P50: cancelled/returned also pre-select previous_status BEFORE
      // the orders.update, then log AFTER the track insert. Order:
      //   [pre-select, orders.update, order_tracks.insert, activity_logs.insert]
      // Routine statuses only do update + track insert (2 responses).
      const isHighSignal = status === "cancelled" || status === "returned";
      if (isHighSignal) {
        admin.enqueueResponse({ data: { status: "pending" }, error: null });
      }
      admin.enqueueResponse({ data: null, error: null }); // orders.update
      admin.enqueueResponse({ data: null, error: null }); // order_tracks.insert
      if (isHighSignal) {
        admin.enqueueResponse({ data: null, error: null }); // activity_logs.insert
      }

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

  it("auto-generates invoice on transition to 'processing' (fails gracefully without invoices:create)", async () => {
    asAdmin({ orders: ["edit"] }); // no invoices:create
    const admin = getAdminClient();
    // Status update itself: orders.update + order_tracks.insert.
    admin.enqueueResponse({ data: null, error: null }); // 1) orders.update
    admin.enqueueResponse({ data: null, error: null }); // 2) order_tracks.insert
    // The action re-fetches the order to read its current
    // invoice_id (was null, so auto-invoice is triggered). The re-fetch
    // succeeds. The subsequent generateInvoice call asserts
    // `invoices:create` which the caller does not have — it throws
    // PermissionError. The outer try/catch swallows the error AND
    // surfaces it in `invoiceError` so OrderActionControls can show
    // a warning toast. The status update still succeeds.
    admin.enqueueResponse({
      data: makeOrder({ id: "o-1", status: "processing", invoice_id: null }),
      error: null,
    });

    const result = await updateOrderStatus("o-1", "processing");
    expect(result.invoiceId).toBeNull();
    expect(result.invoiceError).toBeDefined();
    expect(result.invoiceError).toMatch(/Permission/i);
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
    // P50: pre-delete select to capture order_number + store_id
    admin.enqueueResponse({ data: { order_number: "ORD-1", store_id: null }, error: null });
    admin.enqueueResponse({ data: null, error: null });
    admin.enqueueResponse({ data: null, error: null });
    admin.enqueueResponse({ data: null, error: null });
    admin.enqueueResponse({ data: null, error: null });
    // activity_logs insert
    admin.enqueueResponse({ data: null, error: null });

    await deleteOrder("o-1");

    const tablesTouched = admin.calls
      .filter((c) => c.method === "from")
      .map((c) => c.args[0]);
    expect(tablesTouched).toEqual([
      "orders", // pre-delete select
      "order_tracks",
      "order_items",
      "invoices",
      "orders",
      "activity_logs",
    ]);
  });

  it("revalidates /orders after deletion", async () => {
    asSuperAdmin();
    const admin = getAdminClient();
    admin.enqueueResponse({ data: { order_number: "ORD-1", store_id: null }, error: null });
    admin.enqueueResponse({ data: null, error: null });
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
    admin.enqueueResponse({ data: { order_number: "ORD-1", store_id: null }, error: null });
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
    admin.enqueueResponse({ data: { order_number: "ORD-1", store_id: null }, error: null });
    admin.enqueueResponse({ data: null, error: null });
    admin.enqueueResponse({ data: null, error: null });
    admin.enqueueResponse({ data: null, error: null });
    admin.enqueueResponse({ data: null, error: null });
    admin.enqueueResponse({ data: null, error: null });

    await expect(deleteOrder("o-1")).resolves.not.toThrow();

    const tablesTouched = admin.calls
      .filter((c) => c.method === "from")
      .map((c) => c.args[0]);
    expect(tablesTouched).toEqual([
      "orders", // pre-delete select (P50)
      "order_tracks",
      "order_items",
      "invoices",
      "orders",
      "activity_logs",
    ]);
  });
});

describe("P50: activity logging — audit trail (deleteOrder)", () => {
  // P50: Super Admin only deletion now writes an activity_logs row.
  // The capturing select for order_number + store_id must happen
  // BEFORE the cascade delete so the log payload is useful for
  // forensics. We assert both the log shape and that the
  // pre-delete select was made.
  it("captures order_number + store_id BEFORE the cascade and writes a delete log row", async () => {
    asSuperAdmin();
    setServerUser({ id: "u-sa", email: "sa@test.com" });
    const admin = getAdminClient();
    // 1. pre-delete select: orders.select("order_number, store_id")
    admin.enqueueResponse({
      data: { order_number: "ORD-99", store_id: "s-1" },
      error: null,
    });
    // 2-5. cascade deletes (4x null)
    admin.enqueueResponse({ data: null, error: null });
    admin.enqueueResponse({ data: null, error: null });
    admin.enqueueResponse({ data: null, error: null });
    admin.enqueueResponse({ data: null, error: null });
    // 6. activity_logs insert
    admin.enqueueResponse({ data: null, error: null });

    await deleteOrder("o-99");

    const logChains = admin.chainsForTable("activity_logs");
    expect(logChains).toHaveLength(1);
    const insertCall = logChains[0].find((c) => c.method === "insert");
    expect(insertCall).toBeDefined();
    const insertArg = insertCall!.args[0] as Record<string, unknown>;
    expect(insertArg).toMatchObject({
      user_id: "u-sa",
      action: "delete",
      entity_type: "order",
      entity_id: "o-99",
      details: { order_number: "ORD-99", store_id: "s-1" },
    });
  });

  it("does NOT write an activity log when the caller's permission check fails", async () => {
    asAdmin({ orders: ["view", "edit"] });
    // No setServerUser call — we want to assert NO insert happened.
    const admin = getAdminClient();

    await expect(deleteOrder("o-1")).rejects.toBeInstanceOf(PermissionError);

    const logChains = admin.chainsForTable("activity_logs");
    expect(logChains).toHaveLength(0);
  });

  it("does NOT write an activity log when the final orders.delete fails", async () => {
    asSuperAdmin();
    setServerUser({ id: "u-sa", email: "sa@test.com" });
    const admin = getAdminClient();
    admin.enqueueResponse({ data: { order_number: "ORD-1", store_id: "s-1" }, error: null });
    admin.enqueueResponse({ data: null, error: null });
    admin.enqueueResponse({ data: null, error: null });
    admin.enqueueResponse({ data: null, error: null });
    admin.enqueueResponse({ data: null, error: { message: "delete failed" } });
    // No activity_logs response enqueued — if the code wrongly
    // tried to log, it would consume the next response (which we
    // don't have) and cause an undefined error.

    await expect(deleteOrder("o-1")).rejects.toThrow("delete failed");

    const logChains = admin.chainsForTable("activity_logs");
    expect(logChains).toHaveLength(0);
  });

  it("still completes the delete when the activity log insert fails (best-effort)", async () => {
    asSuperAdmin();
    setServerUser({ id: "u-sa", email: "sa@test.com" });
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const admin = getAdminClient();
    admin.enqueueResponse({ data: { order_number: "ORD-1", store_id: "s-1" }, error: null });
    admin.enqueueResponse({ data: null, error: null });
    admin.enqueueResponse({ data: null, error: null });
    admin.enqueueResponse({ data: null, error: null });
    admin.enqueueResponse({ data: null, error: null });
    // activity_logs insert fails
    admin.enqueueResponse({ data: null, error: { message: "log db down" } });

    await expect(deleteOrder("o-1")).resolves.not.toThrow();

    const logChains = admin.chainsForTable("activity_logs");
    expect(logChains).toHaveLength(1);
    expect(consoleSpy).toHaveBeenCalledWith(
      "[activity-log] insert failed:",
      "log db down",
    );
    consoleSpy.mockRestore();
  });
});

describe("P50: activity logging — audit trail (updateOrderStatus)", () => {
  // Routine status changes (pending → confirmed → shipped →
  // delivered) intentionally do NOT write activity_log rows. Only
  // high-signal transitions (cancelled, returned) log.

  it("does NOT log routine status transitions (pending, confirmed, shipped, delivered, processing)", async () => {
    asAdmin({ orders: ["edit"] });
    const admin = getAdminClient();
    const routine: OrderStatus[] = ["pending", "confirmed", "shipped", "delivered", "processing"];

    for (const status of routine) {
      // P50: confirmed and delivered also need the pre-update select
      // for their own timestamps; we don't need to enqueue extra
      // responses because the action doesn't add a select for
      // routine statuses. Just queue the two writes.
      admin.enqueueResponse({ data: null, error: null });
      admin.enqueueResponse({ data: null, error: null });

      await updateOrderStatus("o-1", status);

      // No activity_logs chain should have been built for this iteration.
      // (We check at the end by counting total chains.)
    }

    expect(admin.chainsForTable("activity_logs")).toHaveLength(0);
  });

  it("writes a 'status_cancelled' log when status transitions to 'cancelled' (with previous_status)", async () => {
    asAdmin({ orders: ["edit"] });
    setServerUser({ id: "u-1", email: "u@test.com" });
    const admin = getAdminClient();
    // 1. pre-update select to capture previous_status
    admin.enqueueResponse({ data: { status: "pending" }, error: null });
    // 2. orders.update
    admin.enqueueResponse({ data: null, error: null });
    // 3. order_tracks.insert
    admin.enqueueResponse({ data: null, error: null });
    // 4. activity_logs.insert
    admin.enqueueResponse({ data: null, error: null });

    await updateOrderStatus("o-1", "cancelled", "Customer requested");

    const logChains = admin.chainsForTable("activity_logs");
    expect(logChains).toHaveLength(1);
    const insertArg = logChains[0].find((c) => c.method === "insert")!
      .args[0] as Record<string, unknown>;
    expect(insertArg).toMatchObject({
      user_id: "u-1",
      action: "update",
      entity_type: "order",
      entity_id: "o-1",
      details: {
        action_type: "status_cancelled",
        previous_status: "pending",
        new_status: "cancelled",
        notes: "Customer requested",
      },
    });
  });

  it("writes a 'status_returned' log when status transitions to 'returned'", async () => {
    asAdmin({ orders: ["edit"] });
    setServerUser({ id: "u-1", email: "u@test.com" });
    const admin = getAdminClient();
    admin.enqueueResponse({ data: { status: "delivered" }, error: null });
    admin.enqueueResponse({ data: null, error: null });
    admin.enqueueResponse({ data: null, error: null });
    admin.enqueueResponse({ data: null, error: null });

    await updateOrderStatus("o-1", "returned");

    const logChains = admin.chainsForTable("activity_logs");
    expect(logChains).toHaveLength(1);
    const insertArg = logChains[0].find((c) => c.method === "insert")!
      .args[0] as Record<string, unknown>;
    expect(insertArg).toMatchObject({
      action: "update",
      details: {
        action_type: "status_returned",
        previous_status: "delivered",
        new_status: "returned",
        notes: null,
      },
    });
  });
});
