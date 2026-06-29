-- ============================================================================
-- P62: Return requests for delivered orders
-- ----------------------------------------------------------------------------
-- The original `orders` table (Flutter app's initial schema) uses
-- TEXT + CHECK constraint for the `status` column, NOT a
-- PostgreSQL enum type. So this migration drops the old CHECK
-- and adds a new one that includes the 4 return-workflow values.
-- (The 'returned' value already existed in the original CHECK; the
-- P62 workflow extends the enum semantics to include the 4 new
-- intermediate states. The CHECK remains the source of truth for
-- which values are valid.)
--
-- A return request is created by a customer (via the Flutter app)
-- or by a Manager on the customer's behalf (customer-service
-- case). The Manager transitions the request through received ->
-- processing -> approved | rejected, then fulfilled.
--
-- 24-hour SLA: customer-raised requests must be filed within 24
-- hours of order delivery. Manager-raised requests bypass the
-- SLA (customer-service exception). The check is enforced in the
-- server action; the Flutter app disables the button
-- client-side for the same window as a UI hint.
--
-- delivered_at_at_request is stamped at create time. Lets the
-- activity_log answer "did we honor the 24-hour SLA?" without
-- re-joining to orders.delivered_at (which may have been
-- re-delivered in edge cases).
-- ============================================================================

-- 1. Update the orders.status CHECK to include the 4 return-workflow
--    values. Drop the old constraint, add the new one.
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE public.orders
  ADD CONSTRAINT orders_status_check CHECK (
    status IN (
      'pending', 'confirmed', 'processing', 'out_for_delivery',
      'delivered', 'cancelled', 'returned',
      'return_requested', 'return_processing',
      'return_approved', 'return_rejected'
    )
  );

-- 2. The return_requests table.
CREATE TABLE return_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  -- Nullable: Super Admin can raise a return on the customer's
  -- behalf (customer-service exception), in which case this
  -- column is NULL (the manager IS the requester; we don't
  -- record the manager's id here, it's in the activity_log).
  requested_by UUID REFERENCES public.profiles(id),
  source TEXT NOT NULL CHECK (source IN ('customer', 'manager')),
  reason TEXT NOT NULL CHECK (reason IN (
    'damaged', 'wrong_item', 'not_as_described', 'size_fit', 'other'
  )),
  customer_notes TEXT,
  state TEXT NOT NULL DEFAULT 'pending' CHECK (state IN (
    'pending', 'received', 'processing', 'approved', 'rejected', 'fulfilled'
  )),
  resolution TEXT CHECK (resolution IN (
    'full_refund', 'partial_refund', 'replacement'
  )),
  -- Only set when state='approved' AND resolution='partial_refund'.
  resolution_amount NUMERIC(10, 2) CHECK (
    resolution_amount IS NULL OR resolution_amount >= 0
  ),
  -- Placeholder for the future payment-gateway integration. When
  -- the gateway call lands, the Manager pastes the gateway-side
  -- refund id here. The action validates that this is set when
  -- the request is marked 'fulfilled' (or 'cancelled' for the
  -- "Manager did the refund manually" path).
  gateway_refund_id TEXT,
  manager_notes TEXT,
  decided_by UUID REFERENCES public.profiles(id),
  decided_at TIMESTAMPTZ,
  fulfilled_at TIMESTAMPTZ,
  -- SLA audit column. Stamped at create time so the
  -- activity_log row "request created" includes the age context
  -- without joining to orders. NULL for Manager-raised requests
  -- (they bypass the SLA).
  delivered_at_at_request TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Indexes. The "pending" lookup is the hot one (powers the
-- badge in the orders list and the Manager inbox).
CREATE INDEX return_requests_order_id_idx
  ON return_requests(order_id);
CREATE INDEX return_requests_state_idx
  ON return_requests(state)
  WHERE state NOT IN ('fulfilled', 'rejected');
CREATE INDEX return_requests_created_at_idx
  ON return_requests(created_at DESC);

-- 4. RLS. The admin app uses the service-role key (bypasses RLS).
-- The Flutter customer app uses the anon key and is restricted
-- to its own user_id.
ALTER TABLE return_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own return requests" ON return_requests
  FOR SELECT USING (requested_by = auth.uid());
CREATE POLICY "Admins see all return requests" ON return_requests
  FOR ALL USING (public.is_admin());
