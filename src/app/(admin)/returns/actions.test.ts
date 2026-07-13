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

import {
  createReturnRequest,
  listReturnRequestsForOrder,
  getReturnRequestItems,
  countPendingReturnRequestsForOrder,
  updateReturnRequestState,
  deleteReturnRequest,
} from "./actions";
import type { ReturnRequest, ReturnRequestItem } from "@/lib/types/supabase";

beforeEach(() => {
  resetSupabaseClients();
  resetPermissionMock();
  revalidatePathMock.mockClear();
  assertPermissionMock.mockClear();
});

const baseOrder = (overrides: Record<string, unknown> = {}) => ({
  delivered_at: new Date(Date.now() - 4 * 3_600_000).toISOString(),
  status: "delivered",
  store_id: "s-1",
  ...overrides,
});

const baseOrderItem = (
  overrides: Record<string, unknown> = {},
) => ({
  id: "oi-1",
  order_id: "o-1",
  product_id: "p-1",
  product_name: "Apple",
  quantity: 5,
  unit_price: 100,
  total_price: 500,
  gst_rate: 0,
  gst_amount: 0,
  status: "confirmed",
  category_id: null,
  product_sku: "A-1",
  variant_id: null,
  variant_name: null,
  product_hsn_code: null,
  ...overrides,
});

const baseReturnRequest = (
  overrides: Partial<ReturnRequest> = {},
): ReturnRequest => ({
  id: "rr-1",
  order_id: "o-1",
  requested_by: "u-1",
  source: "customer",
  reason: "damaged",
  customer_notes: null,
  state: "pending",
  resolution: null,
  resolution_amount: null,
  gateway_refund_id: null,
  manager_notes: null,
  decided_by: null,
  decided_at: null,
  fulfilled_at: null,
  delivered_at_at_request: new Date().toISOString(),
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  ...overrides,
});

const baseReturnItem = (
  overrides: Partial<ReturnRequestItem> = {},
): ReturnRequestItem => ({
  id: "rri-1",
  return_request_id: "rr-1",
  order_item_id: "oi-1",
  quantity: 2,
  created_at: new Date().toISOString(),
  order_items: { product_name: "Apple", variant_name: "Red", unit_price: 50 },
  ...overrides,
});

// -------------------------------------------------------------------------
// createReturnRequest
// -------------------------------------------------------------------------

describe("createReturnRequest", () => {
  it("rejects callers without returns:create", async () => {
    asAdmin({ orders: ["view"], returns: [] });
    await expect(
      createReturnRequest({
        orderId: "o-1",
        source: "customer",
        reason: "damaged",
        items: [{ order_item_id: "oi-1", quantity: 1 }],
      }),
    ).rejects.toBeInstanceOf(PermissionError);
  });

  it("rejects when no items are selected", async () => {
    asAdmin({ returns: ["create"] });
    await expect(
      createReturnRequest({
        orderId: "o-1",
        source: "customer",
        reason: "damaged",
        items: [],
      }),
    ).rejects.toThrow(/At least one item/);
  });

  it("rejects when an item has quantity <= 0", async () => {
    asAdmin({ returns: ["create"] });
    await expect(
      createReturnRequest({
        orderId: "o-1",
        source: "customer",
        reason: "damaged",
        items: [{ order_item_id: "oi-1", quantity: 0 }],
      }),
    ).rejects.toThrow(/quantity must be > 0/);
  });

  it("rejects when the order is not delivered (customer-raised, within window)", async () => {
    asAdmin({ returns: ["create"] });
    const admin = getAdminClient();
    admin.enqueueResponse({ data: baseOrder({ status: "pending" }), error: null });
    await expect(
      createReturnRequest({
        orderId: "o-1",
        source: "customer",
        reason: "damaged",
        items: [{ order_item_id: "oi-1", quantity: 1 }],
      }),
    ).rejects.toThrow(/Can only raise a return request for a delivered order/);
  });

  it("rejects customer-raised request when delivered_at is NULL (legacy orders)", async () => {
    asAdmin({ returns: ["create"] });
    const admin = getAdminClient();
    admin.enqueueResponse({ data: baseOrder({ delivered_at: null }), error: null });
    await expect(
      createReturnRequest({
        orderId: "o-1",
        source: "customer",
        reason: "damaged",
        items: [{ order_item_id: "oi-1", quantity: 1 }],
      }),
    ).rejects.toThrow(/no delivery timestamp/);
  });

  it("rejects customer-raised request when SLA window has closed (24h+)", async () => {
    asAdmin({ returns: ["create"] });
    const admin = getAdminClient();
    const longAgo = new Date(Date.now() - 30 * 3_600_000).toISOString();
    admin.enqueueResponse({ data: baseOrder({ delivered_at: longAgo }), error: null });
    await expect(
      createReturnRequest({
        orderId: "o-1",
        source: "customer",
        reason: "damaged",
        items: [{ order_item_id: "oi-1", quantity: 1 }],
      }),
    ).rejects.toThrow(/Return window has closed/);
  });

  it("ALLOWS manager-raised request even after SLA window has closed", async () => {
    asAdmin({ returns: ["create"] });
    const admin = getAdminClient();
    const longAgo = new Date(Date.now() - 30 * 3_600_000).toISOString();
    // Order fetch
    admin.enqueueResponse({ data: baseOrder({ delivered_at: longAgo }), error: null });
    // Order items fetch (for validation)
    admin.enqueueResponse({ data: [baseOrderItem()], error: null });
    // Return request insert
    admin.enqueueResponse({ data: baseReturnRequest({ source: "manager" }), error: null });
    // Return request items insert
    admin.enqueueResponse({ data: null, error: null });
    // Orders update
    admin.enqueueResponse({ data: null, error: null });
    // Order tracks insert
    admin.enqueueResponse({ data: null, error: null });

    const result = await createReturnRequest({
      orderId: "o-1",
      source: "manager",
      reason: "damaged",
      items: [{ order_item_id: "oi-1", quantity: 1 }],
    });
    expect(result.source).toBe("manager");
  });

  it("rejects when an item's order_item_id does not belong to the order", async () => {
    asAdmin({ returns: ["create"] });
    const admin = getAdminClient();
    admin.enqueueResponse({ data: baseOrder(), error: null });
    admin.enqueueResponse({
      data: [baseOrderItem({ order_id: "o-OTHER" })],
      error: null,
    });
    await expect(
      createReturnRequest({
        orderId: "o-1",
        source: "customer",
        reason: "damaged",
        items: [{ order_item_id: "oi-1", quantity: 1 }],
      }),
    ).rejects.toThrow(/does not belong to order/);
  });

  it("rejects when return quantity exceeds the original order quantity", async () => {
    asAdmin({ returns: ["create"] });
    const admin = getAdminClient();
    admin.enqueueResponse({ data: baseOrder(), error: null });
    admin.enqueueResponse({ data: [baseOrderItem({ quantity: 3 })], error: null });
    await expect(
      createReturnRequest({
        orderId: "o-1",
        source: "customer",
        reason: "damaged",
        items: [{ order_item_id: "oi-1", quantity: 5 }],
      }),
    ).rejects.toThrow(/exceeds the original/);
  });

  it("happy path: customer-raised within window, items validated, insert + tracks + log", async () => {
    asAdmin({ returns: ["create"] });
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const admin = getAdminClient();
    // 1) Order fetch
    admin.enqueueResponse({ data: baseOrder(), error: null });
    // 2) Order items fetch (validation)
    admin.enqueueResponse({ data: [baseOrderItem()], error: null });
    // 3) Insert return_requests
    admin.enqueueResponse({ data: baseReturnRequest(), error: null });
    // 4) Insert return_request_items
    admin.enqueueResponse({ data: null, error: null });
    // 5) Update orders.status
    admin.enqueueResponse({ data: null, error: null });
    // 6) Insert order_tracks
    admin.enqueueResponse({ data: null, error: null });

    const result = await createReturnRequest({
      orderId: "o-1",
      source: "customer",
      reason: "damaged",
      items: [{ order_item_id: "oi-1", quantity: 2 }],
    });
    expect(result.id).toBe("rr-1");
    expect(result.state).toBe("pending");
    expect(result.source).toBe("customer");
    consoleSpy.mockRestore();
  });

  it("rolls back the return_requests insert if the items insert fails", async () => {
    asAdmin({ returns: ["create"] });
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const admin = getAdminClient();
    admin.enqueueResponse({ data: baseOrder(), error: null });
    admin.enqueueResponse({ data: [baseOrderItem()], error: null });
    admin.enqueueResponse({ data: baseReturnRequest(), error: null });
    // Items insert fails
    admin.enqueueResponse({ data: null, error: { message: "FK violation" } });
    // The action attempts a rollback delete of the parent
    admin.enqueueResponse({ data: null, error: null });

    await expect(
      createReturnRequest({
        orderId: "o-1",
        source: "customer",
        reason: "damaged",
        items: [{ order_item_id: "oi-1", quantity: 2 }],
      }),
    ).rejects.toThrow(/FK violation/);
    consoleSpy.mockRestore();
  });
});

// -------------------------------------------------------------------------
// listReturnRequestsForOrder
// -------------------------------------------------------------------------

describe("listReturnRequestsForOrder", () => {
  it("returns the requests for the order, newest first", async () => {
    asAdmin({ returns: ["view"] });
    const admin = getAdminClient();
    const requests = [
      baseReturnRequest({ id: "rr-2" }),
      baseReturnRequest({ id: "rr-1" }),
    ];
    admin.enqueueResponse({ data: requests, error: null });

    const result = await listReturnRequestsForOrder("o-1");
    expect(result).toHaveLength(2);
  });
});

// -------------------------------------------------------------------------
// getReturnRequestItems
// -------------------------------------------------------------------------

describe("getReturnRequestItems", () => {
  it("returns the items for a request with joined order_items data", async () => {
    asAdmin({ returns: ["view"] });
    const admin = getAdminClient();
    admin.enqueueResponse({
      data: [baseReturnItem({ id: "rri-1" }), baseReturnItem({ id: "rri-2", order_item_id: "oi-2", quantity: 1 })],
      error: null,
    });
    admin.enqueueResponse({
      data: [
        { id: "oi-1", product_name: "Apple", variant_name: "Red", unit_price: 50 },
        { id: "oi-2", product_name: "Bread", variant_name: "Whole Wheat", unit_price: 30 },
      ],
      error: null,
    });

    const result = await getReturnRequestItems("rr-1");
    expect(result).toHaveLength(2);
    expect(result[0].order_items?.product_name).toBe("Apple");
    expect(result[0].order_items?.variant_name).toBe("Red");
    expect(result[0].order_items?.unit_price).toBe(50);
    expect(result[1].order_items?.product_name).toBe("Bread");
  });

  it("returns empty array when no items exist", async () => {
    asAdmin({ returns: ["view"] });
    const admin = getAdminClient();
    admin.enqueueResponse({ data: [], error: null });

    const result = await getReturnRequestItems("rr-1");
    expect(result).toEqual([]);
  });

  it("returns items with null order_items when order_items not found", async () => {
    asAdmin({ returns: ["view"] });
    const admin = getAdminClient();
    admin.enqueueResponse({
      data: [baseReturnItem({ id: "rri-99", order_item_id: "oi-missing" })],
      error: null,
    });
    admin.enqueueResponse({ data: [], error: null });

    const result = await getReturnRequestItems("rr-1");
    expect(result).toHaveLength(1);
    expect(result[0].order_items).toBeNull();
  });
});

// -------------------------------------------------------------------------
// countPendingReturnRequestsForOrder
// -------------------------------------------------------------------------

describe("countPendingReturnRequestsForOrder", () => {
  it("returns the count of pending requests for the order", async () => {
    asAdmin({ returns: ["view"] });
    const admin = getAdminClient();
    admin.enqueueResponse({ count: 3, data: null, error: null });

    const result = await countPendingReturnRequestsForOrder("o-1");
    expect(result).toBe(3);
  });

  it("returns 0 on query error (does not throw)", async () => {
    asAdmin({ returns: ["view"] });
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const admin = getAdminClient();
    admin.enqueueResponse({ count: null, data: null, error: { message: "boom" } });

    const result = await countPendingReturnRequestsForOrder("o-1");
    expect(result).toBe(0);
    consoleSpy.mockRestore();
  });
});

// -------------------------------------------------------------------------
// updateReturnRequestState
// -------------------------------------------------------------------------

describe("updateReturnRequestState", () => {
  it("rejects illegal state transitions (pending -> fulfilled)", async () => {
    asAdmin({ returns: ["edit"] });
    const admin = getAdminClient();
    // 1) Read current state — must be enqueued so the action can
    //    read the current state and detect the illegal transition.
    admin.enqueueResponse({ data: baseReturnRequest(), error: null });

    await expect(
      updateReturnRequestState({
        requestId: "rr-1",
        toState: "fulfilled",
      }),
    ).rejects.toThrow(/Illegal state transition/);
  });

  it("happy path: pending -> received", async () => {
    asAdmin({ returns: ["edit"] });
    const admin = getAdminClient();
    // 1) Read current state
    admin.enqueueResponse({ data: baseReturnRequest(), error: null });
    // 2) Update return_requests (no order update for "received" state)
    admin.enqueueResponse({
      data: { ...baseReturnRequest(), state: "received" },
      error: null,
    });
    // 3) Insert order_tracks
    admin.enqueueResponse({ data: null, error: null });

    const result = await updateReturnRequestState({
      requestId: "rr-1",
      toState: "received",
    });
    expect(result.state).toBe("received");
  });

  it("approved + full_refund sets orders.payment_status to 'refunded'", async () => {
    asAdmin({ returns: ["edit"] });
    const admin = getAdminClient();
    // 1) Read current
    admin.enqueueResponse({ data: baseReturnRequest(), error: null });
    // 2) Auto-calc query is NOT issued (full_refund doesn't need it)
    // 3) Update return_requests
    admin.enqueueResponse({
      data: { ...baseReturnRequest(), state: "approved", resolution: "full_refund" },
      error: null,
    });
    // 4) Update orders
    admin.enqueueResponse({ data: null, error: null });
    // 5) Insert order_tracks
    admin.enqueueResponse({ data: null, error: null });

    await updateReturnRequestState({
      requestId: "rr-1",
      toState: "approved",
      resolution: "full_refund",
    });

    // Verify the orders update set status=return_approved + payment_status=refunded
    const orderChains = admin.chainsForTable("orders");
    const orderUpdateChain = orderChains.find((c) => c.some((x) => x.method === "update"));
    const orderUpdate = orderUpdateChain?.find((c) => c.method === "update");
    const updateArg = orderUpdate?.args[0] as Record<string, unknown>;
    expect(updateArg?.status).toBe("return_approved");
    expect(updateArg?.payment_status).toBe("refunded");
  });

  it("rejected reverts orders.status to 'delivered' (no payment change)", async () => {
    asAdmin({ returns: ["edit"] });
    const admin = getAdminClient();
    // 1) Read current (state=processing)
    admin.enqueueResponse({ data: baseReturnRequest({ state: "processing" }), error: null });
    // 2) Update return_requests
    admin.enqueueResponse({
      data: { ...baseReturnRequest({ state: "processing" }), state: "rejected" },
      error: null,
    });
    // 3) Update orders (revert to delivered, no payment change)
    admin.enqueueResponse({ data: null, error: null });
    // 4) Insert order_tracks
    admin.enqueueResponse({ data: null, error: null });

    await updateReturnRequestState({
      requestId: "rr-1",
      toState: "rejected",
      managerNotes: "Out of SLA window",
    });

    const orderChains = admin.chainsForTable("orders");
    const orderUpdateChain = orderChains.find((c) => c.some((x) => x.method === "update"));
    const orderUpdate = orderUpdateChain?.find((c) => c.method === "update");
    const updateArg = orderUpdate?.args[0] as Record<string, unknown>;
    expect(updateArg?.status).toBe("delivered");
    expect("payment_status" in (updateArg ?? {})).toBe(false);
  });

  it("P62 amendment: partial_refund auto-computes resolution_amount from items' unit_price × quantity", async () => {
    asAdmin({ returns: ["edit"] });
    const admin = getAdminClient();
    // 1) Read current
    admin.enqueueResponse({ data: baseReturnRequest(), error: null });
    // 2) Auto-calc: fetch return_request_items (qty 2 each, two items)
    admin.enqueueResponse({
      data: [
        { quantity: 2, order_item_id: "oi-100" },
        { quantity: 2, order_item_id: "oi-50" },
      ],
      error: null,
    });
    // 3) Auto-calc: fetch order_items snapshots (100 + 50 = 300)
    admin.enqueueResponse({
      data: [
        { id: "oi-100", unit_price: 100 },
        { id: "oi-50", unit_price: 50 },
      ],
      error: null,
    });
    // 4) Update return_requests
    admin.enqueueResponse({
      data: { ...baseReturnRequest(), state: "approved", resolution: "partial_refund", resolution_amount: 300 },
      error: null,
    });
    // 5) Update orders
    admin.enqueueResponse({ data: null, error: null });
    // 6) Insert order_tracks
    admin.enqueueResponse({ data: null, error: null });

    await updateReturnRequestState({
      requestId: "rr-1",
      toState: "approved",
      resolution: "partial_refund",
    });

    const rrChains = admin.chainsForTable("return_requests");
    const rrUpdateChain = rrChains.find((c) => c.some((x) => x.method === "update"));
    const rrUpdate = rrUpdateChain?.find((c) => c.method === "update");
    const updateArg = rrUpdate?.args[0] as Record<string, unknown>;
    expect(updateArg?.resolution_amount).toBe(300);
    expect(updateArg?.resolution).toBe("partial_refund");
  });

  it("P62 amendment: explicit resolutionAmount overrides the auto-computed value", async () => {
    asAdmin({ returns: ["edit"] });
    const admin = getAdminClient();
    // 1) Read current
    admin.enqueueResponse({ data: baseReturnRequest(), error: null });
    // 2) No auto-calc queries — explicit resolutionAmount skips them.
    //    The next 5 responses are for update + side-effects.
    // 3) Update return_requests
    admin.enqueueResponse({
      data: { ...baseReturnRequest(), resolution_amount: 100, resolution: "partial_refund", state: "approved" },
      error: null,
    });
    // 4) Update orders
    admin.enqueueResponse({ data: null, error: null });
    // 5) Insert order_tracks
    admin.enqueueResponse({ data: null, error: null });

    await updateReturnRequestState({
      requestId: "rr-1",
      toState: "approved",
      resolution: "partial_refund",
      resolutionAmount: 100,
    });

    const rrChains = admin.chainsForTable("return_requests");
    const rrUpdateChain = rrChains.find((c) => c.some((x) => x.method === "update"));
    const rrUpdate = rrUpdateChain?.find((c) => c.method === "update");
    const updateArg = rrUpdate?.args[0] as Record<string, unknown>;
    expect(updateArg?.resolution_amount).toBe(100);
  });

  it("rejects partial_refund with resolutionAmount <= 0", async () => {
    asAdmin({ returns: ["edit"] });
    const admin = getAdminClient();
    // 1) Read current state — required because the validation
    //    happens AFTER reading the current state (the state
    //    transition validation uses `current.state`).
    admin.enqueueResponse({ data: baseReturnRequest(), error: null });

    await expect(
      updateReturnRequestState({
        requestId: "rr-1",
        toState: "approved",
        resolution: "partial_refund",
        resolutionAmount: 0,
      }),
    ).rejects.toThrow(/resolution_amount must be > 0/);
  });
});

// -------------------------------------------------------------------------
// deleteReturnRequest
// -------------------------------------------------------------------------

describe("deleteReturnRequest", () => {
  it("rejects callers without returns:delete", async () => {
    asAdmin({ returns: ["edit"] });
    await expect(deleteReturnRequest("rr-1")).rejects.toBeInstanceOf(PermissionError);
  });

  it("happy path: deletes the request, reverts orders.status, logs the event", async () => {
    asAdmin({ returns: ["delete"] });
    const admin = getAdminClient();
    // 1) Read current
    admin.enqueueResponse({ data: baseReturnRequest(), error: null });
    // 2) Track lookup for the previous status
    admin.enqueueResponse({ data: { status: "delivered" }, error: null });
    // 3) Delete return_requests
    admin.enqueueResponse({ data: null, error: null });
    // 4) Revert orders.status
    admin.enqueueResponse({ data: null, error: null });
    // 5) Insert order_tracks
    admin.enqueueResponse({ data: null, error: null });

    await deleteReturnRequest("rr-1");

    // Verify the order update set status to 'delivered'
    const orderChains = admin.chainsForTable("orders");
    const orderUpdateChain = orderChains.find((c) => c.some((x) => x.method === "update"));
    const orderUpdate = orderUpdateChain?.find((c) => c.method === "update");
    const updateArg = orderUpdate?.args[0] as Record<string, unknown>;
    expect(updateArg?.status).toBe("delivered");
  });
});
