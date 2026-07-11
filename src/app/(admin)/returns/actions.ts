"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertPermission, PermissionError } from "@/lib/require-permission";
import { logActivity } from "@/lib/activity-log";
import type {
  ReturnRequest,
  ReturnRequestItem,
  ReturnRequestReason,
  ReturnRequestResolution,
  ReturnRequestSource,
  ReturnRequestState,
} from "@/lib/types/supabase";

// ============================================================================
// P62: Return requests — server actions.
//
// Workflow:
//   customer raises request (subject to 24h SLA) selecting WHICH
//     items + HOW MANY of each to return
//   -> pending -> received -> processing -> approved -> fulfilled
//   manager can also reject at any non-terminal state
//   rejected reverts orders.status to 'delivered'
//   fulfilled sets orders.status to 'returned' + orders.payment_status
//     if the resolution is a refund
//
// Partial returns (amendment):
//   The customer picks N items out of M from the order. Each
//   item has a quantity. Stored in the `return_request_items`
//   child table. The `resolution_amount` for partial_refund is
//   auto-computed from the items' unit_price × quantity (using
//   the P26 snapshot columns on order_items).
//
// All state transitions write:
//   - an `order_tracks` row (visible in the customer-facing
//     Flutter order timeline)
//   - an `activity_log` row (P50-style forensically queryable)
//
// 24-hour SLA: customer-raised requests must be filed within 24
// hours of order delivery. Manager-raised requests bypass the
// SLA (customer-service case). The check is enforced in this
// server action; the Flutter app disables the button
// client-side for the same window as a UI hint.
// ============================================================================

/** P62: 24-hour return window. Hardcoded for now; can become a
    config field (per-store or system-wide) in a follow-up. */
const RETURN_WINDOW_HOURS = 24;

/** P62: legal state transitions for updateReturnRequestState. */
const LEGAL_TRANSITIONS: Record<ReturnRequestState, ReturnRequestState[]> = {
  pending:    ["received", "processing", "approved", "rejected"],
  received:   ["processing", "approved", "rejected"],
  processing: ["approved", "rejected"],
  approved:   ["fulfilled"],
  rejected:   [],   // terminal
  fulfilled:  [],   // terminal
};

/** P62: input shape for one item in a return request. The
    order_item_id must belong to the order. quantity is the
    number of units to return (must be > 0 and ≤ the original
    order_items.quantity; the action validates both). */
export type ReturnRequestItemInput = {
  order_item_id: string;
  quantity: number;
};

/**
 * P62: raise a return request. Source can be 'customer' (Flutter
 * app) or 'manager' (Super Admin on the customer's behalf, for
 * customer-service cases). Customer-raised requests are
 * subject to the 24-hour SLA; manager-raised requests bypass it.
 *
 * The action also writes `order_tracks` + `activity_log` rows
 * for the audit trail. Items are stored in the
 * `return_request_items` child table — this enables partial
 * returns (e.g., 1 rotten apple in a 5-item grocery order).
 */
export async function createReturnRequest({
  orderId,
  source,
  reason,
  customerNotes,
  items,
}: {
  orderId: string;
  source: ReturnRequestSource;
  reason: ReturnRequestReason;
  customerNotes?: string;
  /** P62 amendment: the items being returned. At least 1 required.
      Each order_item_id must belong to the order; quantity must
      be > 0 and ≤ order_items.quantity. */
  items: ReturnRequestItemInput[];
}): Promise<ReturnRequest> {
  await assertPermission("returns", "create");
  const supabase = createAdminClient();

  // 0. Item validation: at least 1 item.
  if (!items || items.length === 0) {
    throw new Error("At least one item must be selected for a return request.");
  }
  for (const it of items) {
    if (!it.order_item_id) {
      throw new Error("Each return item must have an order_item_id.");
    }
    if (typeof it.quantity !== "number" || it.quantity <= 0) {
      throw new Error(
        `Return item quantity must be > 0. Got: ${it.quantity} for order_item ${it.order_item_id}.`,
      );
    }
  }

  // 1. Read the order for the SLA check + state sync.
  const { data: order, error: orderError } = await supabase
    .from("orders")
    .select("delivered_at, status, store_id, user_id")
    .eq("id", orderId)
    .single();
  if (orderError) throw new Error(orderError.message);
  if (!order) throw new Error(`Order ${orderId} not found`);

  // 2. SLA: customer-raised requests must be filed within 24h of
  //    delivery. Manager-raised requests bypass the check.
  let deliveredAtAtRequest: string | null = null;
  if (source === "customer") {
    if (order.status !== "delivered") {
      throw new Error(
        "Can only raise a return request for a delivered order. " +
        `This order is currently "${order.status}".`,
      );
    }
    if (!order.delivered_at) {
      throw new Error(
        "Cannot raise a return request: this order has no delivery " +
        "timestamp recorded. Please contact the store manager for assistance.",
      );
    }
    const deliveredAtMs = new Date(order.delivered_at).getTime();
    const ageHours = (Date.now() - deliveredAtMs) / 3_600_000;
    if (ageHours > RETURN_WINDOW_HOURS) {
      const ageHoursRounded = Math.round(ageHours);
      throw new Error(
        `Return window has closed. Return requests must be raised ` +
        `within ${RETURN_WINDOW_HOURS} hours of delivery. ` +
        `This order was delivered ${ageHoursRounded} hours ago. ` +
        `Please contact the store manager for assistance.`,
      );
    }
    deliveredAtAtRequest = order.delivered_at;
  }

  // 3. Fetch the order_items to validate the requested item
  //    references and quantities. We pull id + quantity + unit_price
  //    (the latter is the P26 snapshot, used to compute the
  //    partial_refund amount at update time, AND the unit_price
  //    used to validate the order_total in tests).
  const orderItemIds = items.map((i) => i.order_item_id);
  const { data: orderItems, error: oiError } = await supabase
    .from("order_items")
    .select("id, order_id, quantity, unit_price, product_name")
    .in("id", orderItemIds);
  if (oiError) throw new Error(oiError.message);
  if (!orderItems || orderItems.length !== orderItemIds.length) {
    const found = new Set((orderItems ?? []).map((oi) => oi.id));
    const missing = orderItemIds.filter((id) => !found.has(id));
    throw new Error(
      `Some order_items were not found: ${missing.join(", ")}. ` +
      `They may have been deleted.`,
    );
  }
  // Validate: every order_item must belong to the same order,
  // and the requested quantity must be ≤ the original.
  const orderItemsById = new Map(
    (orderItems as Array<{ id: string; order_id: string; quantity: number; unit_price: number; product_name: string | null }>).map(
      (oi) => [oi.id, oi],
    ),
  );
  for (const req of items) {
    const oi = orderItemsById.get(req.order_item_id);
    if (!oi) {
      throw new Error(`order_item ${req.order_item_id} not found`);
    }
    if (oi.order_id !== orderId) {
      throw new Error(
        `order_item ${req.order_item_id} does not belong to order ${orderId}`,
      );
    }
    if (req.quantity > oi.quantity) {
      throw new Error(
        `Return quantity (${req.quantity}) exceeds the original ` +
        `order quantity (${oi.quantity}) for order_item ${req.order_item_id} ` +
        `(product: ${oi.product_name ?? "(unknown)"}).`,
      );
    }
  }

  // 4. Insert the return_requests row. requested_by is set to
  //    the order owner's user_id so the customer can see the
  //    return request through RLS (requested_by = auth.uid()
  //    policy). The admin app uses the service-role key and
  //    bypasses RLS entirely.
  const { data: inserted, error: insertError } = await supabase
    .from("return_requests")
    .insert({
      order_id: orderId,
      source,
      reason,
      customer_notes: customerNotes ?? null,
      state: "pending",
      delivered_at_at_request: deliveredAtAtRequest,
      requested_by: (order as { user_id: string | null }).user_id ?? null,
    })
    .select("*")
    .single();
  if (insertError) throw new Error(insertError.message);
  if (!inserted) throw new Error("Failed to create return request");

  // 5. Insert the return_request_items child rows. One per
  //    selected item. ON DELETE CASCADE on the FK cleans these up
  //    if the return request is later deleted.
  const itemsInsert = items.map((i) => ({
    return_request_id: (inserted as ReturnRequest).id,
    order_item_id: i.order_item_id,
    quantity: i.quantity,
  }));
  const { error: itemsInsertError } = await supabase
    .from("return_request_items")
    .insert(itemsInsert);
  if (itemsInsertError) {
    // Roll back the parent row to keep state consistent. The
    // manual delete here is OK because the items insert failed
    // (so no FK targets to clean up).
    await supabase.from("return_requests").delete().eq("id", (inserted as ReturnRequest).id);
    throw new Error(itemsInsertError.message);
  }

  // 6. Update orders.status to 'return_requested'.
  const { error: statusError } = await supabase
    .from("orders")
    .update({ status: "return_requested" })
    .eq("id", orderId);
  if (statusError) {
    console.error(
      `[createReturnRequest] order status update failed for ${orderId}:`,
      statusError.message,
    );
    // Non-fatal: the return request row is the source of truth.
  }

  // 7. order_tracks row: visible in the customer's Flutter timeline.
  const { error: trackError } = await supabase.from("order_tracks").insert({
    order_id: orderId,
    status: "return_requested",
    notes: `Return request raised (${source}, ${items.length} item${items.length === 1 ? "" : "s"}): ${reason}`,
  });
  if (trackError) {
    console.error(
      `[createReturnRequest] order_tracks insert failed for ${orderId}:`,
      trackError.message,
    );
  }

  // 8. activity_log: P50-style audit. For customer-raised
  //    requests we include the SLA context (delivered_at +
  //    age_hours) so the row is self-contained. Items are recorded
  //    by id (no need to embed the full P26 snapshot in the log).
  const logDetails: Record<string, unknown> = {
    action_type: "create",
    source,
    reason,
    items: items.map((i) => ({
      order_item_id: i.order_item_id,
      quantity: i.quantity,
    })),
  };
  if (deliveredAtAtRequest) {
    const deliveredAtMs = new Date(deliveredAtAtRequest).getTime();
    logDetails.delivered_at = deliveredAtAtRequest;
    logDetails.age_hours = Math.round(
      ((Date.now() - deliveredAtMs) / 3_600_000) * 10,
    ) / 10;
  }
  if (customerNotes) {
    logDetails.customer_notes = customerNotes;
  }
  await logActivity({
    action: "create",
    entityType: "return_request",
    entityId: (inserted as ReturnRequest).id,
    details: logDetails,
  });

  revalidatePath("/orders");
  revalidatePath(`/orders/${orderId}`);
  return inserted as ReturnRequest;
}

/**
 * P62: read all return requests for an order, newest first.
 * RLS is bypassed by the service-role key, so this returns all
 * requests (Manager view). The Flutter customer's own-row
 * policy still applies to anon-key reads.
 */
export async function listReturnRequestsForOrder(
  orderId: string,
): Promise<ReturnRequest[]> {
  await assertPermission("returns", "view");
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("return_requests")
    .select("*")
    .eq("order_id", orderId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as ReturnRequest[];
}

/**
 * P62 (amendment): read the items of a single return request.
 * Used by the Manager UI to display "1 rotten apple, 2 packets
 * of bread" etc. in the ReturnRequestsPanel and to compute the
 * partial_refund amount. No RLS filter for Manager (they see
 * all items; the parent's RLS would have already restricted the
 * request_id to the customer's own).
 */
export async function getReturnRequestItems(
  requestId: string,
): Promise<ReturnRequestItem[]> {
  await assertPermission("returns", "view");
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("return_request_items")
    .select("*")
    .eq("return_request_id", requestId);
  if (error) throw new Error(error.message);
  return (data ?? []) as ReturnRequestItem[];
}

/**
 * P62: count of pending return requests (state NOT IN
 * 'fulfilled', 'rejected') for orders in the given store.
 * Powers the badge in the orders list. Returns 0 if storeId is
 * null/undefined (Super Admin viewing a single order without
 * store scope).
 */
export async function countPendingReturnRequestsForOrder(
  orderId: string,
): Promise<number> {
  await assertPermission("returns", "view");
  const supabase = createAdminClient();
  const { count, error } = await supabase
    .from("return_requests")
    .select("id", { count: "exact", head: true })
    .eq("order_id", orderId)
    .not("state", "in", "(fulfilled,rejected)");
  if (error) {
    console.error(
      `[countPendingReturnRequestsForOrder] failed for ${orderId}:`,
      error.message,
    );
    return 0;
  }
  return count ?? 0;
}

/**
 * P62: transition a return request through the state machine.
 * Validates the transition is legal (per LEGAL_TRANSITIONS) and
 * applies the side effects on the order (status / payment_status
 * updates). Writes `order_tracks` + `activity_log` rows for the
 * audit trail.
 *
 * Side effects on `orders`:
 *   pending       -> no order change (created with return_requested)
 *   received      -> no order change (still return_requested)
 *   processing    -> orders.status = 'return_processing'
 *   approved      -> orders.status = 'return_approved'
 *                   + orders.payment_status = 'refunded' (full_refund)
 *                     or 'partially_refunded' (partial_refund)
 *                     or unchanged (replacement)
 *   rejected      -> orders.status = 'delivered' (REVERT — order is
 *                   still delivered, the request was denied)
 *   fulfilled     -> orders.status = 'returned' (terminal)
 *
 * Auto-calc: when `resolution='partial_refund'` and the caller does
 * not provide `resolutionAmount`, the action computes it from
 * the items' unit_price × quantity (using the P26 snapshot from
 * order_items). The Manager can override by passing an explicit
 * amount.
 *
 * Returns the updated return request row.
 */
export async function updateReturnRequestState({
  requestId,
  toState,
  managerNotes,
  resolution,
  resolutionAmount,
  gatewayRefundId,
}: {
  requestId: string;
  toState: ReturnRequestState;
  managerNotes?: string;
  /** Required when toState='approved'. */
  resolution?: ReturnRequestResolution;
  /** Optional for partial_refund (auto-computed from items if
      not provided). Must be > 0 when provided. */
  resolutionAmount?: number;
  /** Optional. Populated at the 'fulfilled' transition when the
      gateway refund id is known. */
  gatewayRefundId?: string;
}): Promise<ReturnRequest> {
  await assertPermission("returns", "edit");
  const supabase = createAdminClient();

  // 1. Read the current request + the order_id for state-machine
  //    side effects.
  const { data: current, error: currentError } = await supabase
    .from("return_requests")
    .select("id, order_id, state, resolution, resolution_amount, gateway_refund_id")
    .eq("id", requestId)
    .single();
  if (currentError) throw new Error(currentError.message);
  if (!current) throw new Error(`Return request ${requestId} not found`);

  const fromState = current.state as ReturnRequestState;

  // 2. Validate the transition is legal.
  const allowed = LEGAL_TRANSITIONS[fromState];
  if (!allowed.includes(toState)) {
    throw new Error(
      `Illegal state transition: ${fromState} -> ${toState}. ` +
      `Allowed from ${fromState}: [${allowed.join(", ")}]`,
    );
  }

  // 3. Resolution validation + auto-calc for partial_refund.
  let finalResolution: ReturnRequestResolution | null = resolution ?? null;
  let finalResolutionAmount: number | null = resolutionAmount ?? null;
  if (toState === "approved") {
    if (!resolution) {
      throw new Error(
        "A resolution is required when approving a return request " +
        "(full_refund, partial_refund, or replacement).",
      );
    }
    finalResolution = resolution;

    if (resolution === "partial_refund") {
      if (resolutionAmount != null && resolutionAmount <= 0) {
        throw new Error(
          `resolution_amount must be > 0 for partial_refund. Got: ${resolutionAmount}`,
        );
      }
      if (resolutionAmount == null) {
        // P62 (amendment): auto-calc from the items' unit_price ×
        // quantity. The P26 snapshot on order_items is the
        // price-at-purchase (pre-tax). The Manager can override
        // by passing an explicit resolutionAmount (e.g., if they
        // want to include GST or a goodwill discount).
        const { data: items, error: itemsError } = await supabase
          .from("return_request_items")
          .select("quantity, order_items(unit_price)")
          .eq("return_request_id", requestId);
        if (itemsError) throw new Error(itemsError.message);
        // P62: Supabase JS types embedded single-row joins as arrays,
        // but PostgREST returns a single object. Cast through unknown
        // to reconcile.
        const itemRows = (items ?? []) as unknown as Array<{
          quantity: number;
          order_items: { unit_price: number } | null;
        }>;
        const computed = itemRows.reduce((sum, r) => {
          const up = r.order_items?.unit_price ?? 0;
          return sum + up * Number(r.quantity);
        }, 0);
        if (computed <= 0) {
          throw new Error(
            "Cannot auto-compute resolution_amount: no items found " +
            `on return_request ${requestId}. Pass resolutionAmount ` +
            "explicitly.",
          );
        }
        finalResolutionAmount = Math.round(computed * 100) / 100; // 2dp
      }
    } else if (resolutionAmount != null) {
      throw new Error(
        "resolution_amount is only valid for partial_refund. " +
        `Got resolution=${resolution}, resolution_amount=${resolutionAmount}.`,
      );
    }
  }
  if (toState === "fulfilled" && current.resolution === "partial_refund" && !gatewayRefundId) {
    // Soft warning — log to console but don't block. The Manager
    // may have processed the refund manually without a gateway
    // integration yet.
    console.warn(
      `[updateReturnRequestState] fulfilled with no gateway_refund_id for ${requestId}`,
    );
  }

  // 4. Update the return_requests row.
  const updateFields: Record<string, unknown> = {
    state: toState,
    resolution_amount: finalResolutionAmount, // null or computed value
    updated_at: new Date().toISOString(),
  };
  if (finalResolution) updateFields.resolution = finalResolution;
  if (managerNotes != null) updateFields.manager_notes = managerNotes;
  if (toState === "approved" || toState === "rejected") {
    updateFields.decided_at = new Date().toISOString();
    const { data: { user } } = await (await createClient()).auth.getUser();
    if (user) updateFields.decided_by = user.id;
  }
  if (toState === "fulfilled") {
    updateFields.fulfilled_at = new Date().toISOString();
    if (gatewayRefundId) updateFields.gateway_refund_id = gatewayRefundId;
  }

  const { data: updated, error: updateError } = await supabase
    .from("return_requests")
    .update(updateFields)
    .eq("id", requestId)
    .select("*")
    .single();
  if (updateError) throw new Error(updateError.message);
  if (!updated) throw new Error("Failed to update return request");

  // 5. Apply the side effects on the parent order.
  const orderId = current.order_id as string;
  const orderUpdates: Record<string, unknown> = {};
  let orderTracksNote = "";
  if (toState === "processing") {
    orderUpdates.status = "return_processing";
    orderTracksNote = "Return request: processing";
  } else if (toState === "approved") {
    orderUpdates.status = "return_approved";
    if (finalResolution === "full_refund") {
      orderUpdates.payment_status = "refunded";
    } else if (finalResolution === "partial_refund") {
      orderUpdates.payment_status = "partially_refunded";
    }
    orderTracksNote = `Return request: approved (${finalResolution}${
      finalResolutionAmount != null ? ` ${finalResolutionAmount}` : ""
    })`;
  } else if (toState === "rejected") {
    // Revert to delivered — the order was delivered, the request
    // was denied, the order is still delivered. No payment change.
    orderUpdates.status = "delivered";
    orderTracksNote = "Return request: rejected" + (managerNotes ? ` — ${managerNotes}` : "");
  } else if (toState === "fulfilled") {
    // Terminal: order is "returned" (the historical enum value).
    orderUpdates.status = "returned";
    orderTracksNote =
      `Return request: fulfilled (${current.resolution ?? "resolution"}${
        gatewayRefundId ? `, gateway_refund_id=${gatewayRefundId}` : ""
      })`;
  } else if (toState === "received") {
    orderTracksNote = "Return request: received";
  }

  if (Object.keys(orderUpdates).length > 0) {
    const { error: orderUpdateError } = await supabase
      .from("orders")
      .update(orderUpdates)
      .eq("id", orderId);
    if (orderUpdateError) {
      console.error(
        `[updateReturnRequestState] order update failed for ${orderId}:`,
        orderUpdateError.message,
      );
      // Non-fatal: the return request state is the source of truth.
    }
  }

  // 6. order_tracks: timeline entry. Always (every transition is
  //    visible in the customer's Flutter timeline).
  const { error: trackError } = await supabase.from("order_tracks").insert({
    order_id: orderId,
    status: toState === "approved" || toState === "fulfilled" || toState === "rejected"
      ? `return_${toState}` // return_approved, return_fulfilled, return_rejected
      : toState,
    notes: orderTracksNote || `Return request: ${toState}`,
  });
  if (trackError) {
    console.error(
      `[updateReturnRequestState] order_tracks insert failed for ${orderId}:`,
      trackError.message,
    );
  }

  // 7. activity_log: P50-style audit.
  await logActivity({
    action: "update",
    entityType: "return_request",
    entityId: requestId,
    details: {
      action_type: "transition",
      from_state: fromState,
      to_state: toState,
      order_id: orderId,
      ...(finalResolution ? { resolution: finalResolution } : {}),
      ...(finalResolutionAmount != null ? { resolution_amount: finalResolutionAmount } : {}),
      ...(gatewayRefundId ? { gateway_refund_id: gatewayRefundId } : {}),
      ...(managerNotes ? { manager_notes: managerNotes } : {}),
    },
  });

  revalidatePath("/orders");
  revalidatePath(`/orders/${orderId}`);
  return updated as ReturnRequest;
}

/**
 * P62: hard-delete a return request (Super Admin only). Reverts
 * the parent order's status to 'delivered' (read the previous
 * state from order_tracks). Use case: Manager accidentally
 * created a request and wants to wipe it.
 *
 * Cascade: the return_request_items child rows are auto-deleted
 * by the FK's ON DELETE CASCADE.
 */
export async function deleteReturnRequest(requestId: string): Promise<void> {
  // Super Admin only — assertPermission checks the role for the
  // 'returns' module's 'delete' action. Staff and Manager cannot
  // hard-delete; they can only transition states.
  await assertPermission("returns", "delete");
  const supabase = createAdminClient();

  // 1. Read the request + the previous order status from the
  //    order_tracks (most recent track that isn't a return_*).
  const { data: current, error: currentError } = await supabase
    .from("return_requests")
    .select("id, order_id, state")
    .eq("id", requestId)
    .single();
  if (currentError) throw new Error(currentError.message);
  if (!current) throw new Error(`Return request ${requestId} not found`);

  const orderId = current.order_id as string;

  // 2. Find the most recent order_tracks row with a non-return-*
  //    status to find the previous order state. Default to
  //    'delivered' if no such row exists.
  const { data: lastNonReturnTrack, error: trackError } = await supabase
    .from("order_tracks")
    .select("status")
    .eq("order_id", orderId)
    .not("status", "like", "return_%")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (trackError) {
    console.error(
      `[deleteReturnRequest] track lookup failed for ${orderId}:`,
      trackError.message,
    );
  }
  const previousStatus = (lastNonReturnTrack?.status as string) || "delivered";

  // 3. Delete the return request (cascades to return_request_items).
  const { error: deleteError } = await supabase
    .from("return_requests")
    .delete()
    .eq("id", requestId);
  if (deleteError) throw new Error(deleteError.message);

  // 4. Revert the order status.
  const { error: orderRevertError } = await supabase
    .from("orders")
    .update({ status: previousStatus })
    .eq("id", orderId);
  if (orderRevertError) {
    console.error(
      `[deleteReturnRequest] order revert failed for ${orderId}:`,
      orderRevertError.message,
    );
  }

  // 5. order_tracks: log the deletion as a track event.
  await supabase.from("order_tracks").insert({
    order_id: orderId,
    status: previousStatus,
    notes: `Return request deleted by Super Admin (was ${current.state})`,
  });

  // 6. activity_log.
  await logActivity({
    action: "delete",
    entityType: "return_request",
    entityId: requestId,
    details: {
      order_id: orderId,
      previous_state: current.state,
      order_reverted_to: previousStatus,
    },
  });

  revalidatePath("/orders");
  revalidatePath(`/orders/${orderId}`);
}

// Re-export PermissionError so callers can import it from this module
// (matches the pattern of orders/actions.ts).
export { PermissionError };
