-- ============================================================================
-- P62 (amendment): return_request_items child table for partial returns
-- ----------------------------------------------------------------------------
-- The original `return_requests` table is at the order level. A
-- customer may want to return only N of the items in an order (the
-- 1 rotten apple in a 5-item grocery order). This child table
-- captures WHICH items + HOW MANY of each, attached to a single
-- return request.
--
-- Per-item `reason` is NOT modeled here. The request-level `reason`
-- in return_requests is the canonical one. All items in a single
-- request share the same reason (e.g., "damaged", "wrong_item",
-- "not_as_described"). If we later need per-item reasons, add a
-- `reason` column here.
--
-- `quantity` is NUMERIC(10,2) to match `order_items.quantity` and
-- to support fractional units (kg, liter, etc.). CHECK > 0.
--
-- The Manager UI reads these rows to display the items in the
-- ReturnRequestsPanel and to auto-compute the partial_refund
-- amount (sum of unit_price × quantity across the items, using the
-- P26 snapshot from order_items.unit_price).
-- ============================================================================

CREATE TABLE return_request_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  return_request_id UUID NOT NULL REFERENCES return_requests(id) ON DELETE CASCADE,
  -- No FK to order_items directly: the P26 snapshot columns
  -- (product_name, etc.) on order_items are the source of truth
  -- for the return display, and the order_items row may be SET
  -- NULL'd by the orders.delete CASCADE in extreme cases. We
  -- soft-reference it.
  order_item_id UUID NOT NULL,
  quantity NUMERIC(10, 2) NOT NULL CHECK (quantity > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX return_request_items_request_id_idx
  ON return_request_items(return_request_id);
CREATE INDEX return_request_items_order_item_id_idx
  ON return_request_items(order_item_id);
-- A given order_item_id can appear in multiple return_requests
-- (e.g., customer first asks for a partial refund, then escalates
-- to a full order return). No UNIQUE constraint on order_item_id.

-- RLS: same pattern as the parent. Service-role admin app
-- bypasses RLS; customer (anon key) only sees their own.
ALTER TABLE return_request_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own return request items" ON return_request_items
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM return_requests rr
      WHERE rr.id = return_request_items.return_request_id
        AND rr.requested_by = auth.uid()
    )
  );
CREATE POLICY "Admins see all return request items" ON return_request_items
  FOR ALL USING (public.is_admin());
