export type Profile = {
  id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  avatar_url: string | null;
  role: "customer" | "admin" | "superadmin";
  created_at: string;
  updated_at: string;
};

export type Store = {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  banner_url: string | null;
  owner_id: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  lat: number | null;
  lng: number | null;
  delivery_radius_km: number | null;
  commission_rate: number | null;
  order_id_prefix: string | null;
  is_active: boolean;
  is_open: boolean;
  created_at: string;
};

export type Category = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  image_url: string | null;
  parent_id: string | null;
  is_featured: boolean;
  sort_order: number;
  is_active: boolean;
  created_at: string;
};

export type Product = {
  id: string;
  name: string;
  description: string | null;
  sku: string | null;
  barcode: string | null;
  category_id: string | null;
  brand: string | null;
  unit_of_measurement: "kg" | "gram" | "ml" | "ltr" | "pcs" | "pack" | "dozen" | "box" | "bundle" | "pouch" | "unit" | "tin";
  mrp: number;
  selling_price: number;
  discount_percent: number;
  gst_rate: 0 | 5 | 12 | 18 | 28;
  hsn_code: string | null;
  is_gst_exempted: boolean;
  min_order_qty: number;
  max_order_qty: number | null;
  stock_quantity: number;
  low_stock_threshold: number | null;
  purchase_rate: number | null;
  status: "active" | "inactive" | "out_of_stock";
  store_id: string | null;
  created_at: string;
  updated_at: string;
};

export type ProductVariant = {
  id: string;
  product_id: string;
  name: string;
  sku: string | null;
  price: number;
  stock: number;
  variant_attributes: Record<string, unknown> | null;
  created_at: string;
};

export type ProductImage = {
  id: string;
  product_id: string;
  image_url: string;
  is_primary: boolean;
  sort_order: number;
  uploaded_at: string;
};

export type Order = {
  id: string;
  order_number: string;
  user_id: string;
  store_id: string | null;
  // P62: 'return_requested' / 'return_processing' / 'return_approved'
  // / 'return_rejected' are the workflow values for return requests.
  // 'returned' is the existing terminal value (used when the
  // resolution is fulfilled; also the historical "operator manually
  // set status to returned" path).
  status: "pending" | "confirmed" | "processing" | "out_for_delivery" | "delivered" | "cancelled" | "returned" | "return_requested" | "return_processing" | "return_approved" | "return_rejected";
  subtotal: number;
  discount_amount: number;
  tax_amount: number;
  delivery_charge: number;
  total_amount: number;
  payment_status: "unpaid" | "paid" | "partially_refunded" | "refunded";
  payment_method: "cod" | "card" | "upi" | "netbanking" | "wallet" | null;
  delivery_address_id: string | null;
  delivery_slot_id: string | null;
  delivery_date: string | null;
  placed_at: string;
  created_at: string;
  updated_at: string;
};

/**
 * P26: snapshots captured at order-placement time. These survive product
 * or variant deletion (which SET NULLs the FKs). The DB trigger
 * `order_items_snapshot_trigger` populates them automatically on insert.
 * For legacy rows (placed before the migration), the migration backfills
 * from the current `products`/`product_variants` rows (best-effort).
 */
export type OrderItem = {
  id: string;
  order_id: string;
  product_id: string | null;
  variant_id: string | null;
  quantity: number;
  unit_price: number;
  total_price: number;
  gst_rate: number;
  gst_amount: number;
  status: string;
  category_id: string | null;
  // P26 snapshots (added by migration 20260620000002)
  product_name: string | null;
  product_sku: string | null;
  variant_name: string | null;
  product_hsn_code: string | null;
  created_at: string;
};

export type Banner = {
  id: string;
  name: string;
  link: string | null;
  image_url: string | null;
  position: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type OrderTrack = {
  id: string;
  order_id: string;
  status: string;
  notes: string | null;
  created_by: string | null;
  created_at: string;
};

export type Setting = {
  id: string;
  key: string;
  value: Record<string, unknown>;
  group_name: "store" | "payment" | "notification" | "general" | "gst";
  created_at: string;
  updated_at: string;
};

export type Notification = {
  id: string;
  user_id: string;
  title: string;
  body: string;
  type: "order" | "promo" | "system";
  is_read: boolean;
  read_at: string | null;
  data: Record<string, unknown> | null;
  created_at: string;
};

export type DeliveryZone = {
  id: string;
  store_id: string | null;
  name: string;
  pincodes: string[];
  radius_km: number | null;
  delivery_charge: number;
  free_delivery_min_order: number | null;
  is_active: boolean;
  is_express: boolean;
  boundary: number[][] | null;
  created_at: string;
};

export type DeliverySlot = {
  id: string;
  zone_id: string | null;
  name: string;
  start_time: string;
  end_time: string;
  available_days: number[];
  capacity: number;
  is_active: boolean;
  created_at: string;
};

export type Invoice = {
  id: string;
  order_id: string;
  gstin_id: string | null;
  invoice_number: string;
  invoice_type: "original" | "revised" | "credit_note" | "debit_note";
  taxable_amount: number;
  cgst: number | null;
  sgst: number | null;
  igst: number | null;
  total_amount: number;
  status: "generated" | "sent" | "paid" | "cancelled";
  pdf_url: string | null;
  invoice_date: string;
  created_at: string;
};

export type GSTNumber = {
  id: string;
  store_id: string | null;
  gstin: string;
  legal_name: string;
  business_address: string | null;
  state_code: string | null;
  is_primary: boolean;
  is_active: boolean;
  created_at: string;
};

export type Role = {
  id: number;
  name: string;
  description: string | null;
  permissions: Record<string, string[]>;
  is_system: boolean;
  created_at: string;
  updated_at: string;
};

export type ActivityLog = {
  id: number;
  user_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
};

// ============================================================================
// P62: Return requests. A return request is a workflow entity attached
// to an order. It's created by a customer (via the Flutter app, future
// PR) or by a Manager on the customer's behalf (customer-service
// exception, bypasses the 24-hour SLA). The Manager transitions it
// through received -> processing -> approved | rejected, then
// fulfilled. approved sets orders.payment_status to refunded or
// partially_refunded (or no change for replacement); fulfilled
// sets orders.status to 'returned'.
// ============================================================================

/** P62: source of the request. 'customer' = raised by the customer
    via the Flutter app (subject to the 24-hour SLA).
    'manager' = raised by a Super Admin or Store Manager on the
    customer's behalf (customer-service case; bypasses the SLA). */
export type ReturnRequestSource = "customer" | "manager";

/** P62: reason the customer is returning. Single-select dropdown in
    the Flutter app + Manager-raise form. */
export type ReturnRequestReason =
  | "damaged"
  | "wrong_item"
  | "not_as_described"
  | "size_fit"
  | "other";

/** P62: workflow state machine. Valid transitions (enforced in
    updateReturnRequestState):

      pending   -> received | processing | approved | rejected
      received  -> processing | approved | rejected
      processing -> approved | rejected
      approved   -> fulfilled
      rejected   -> (terminal)
      fulfilled  -> (terminal)

  Side effects per state:
    pending   -- orders.status -> 'return_requested' (on create)
    received  -- orders.status -> 'return_requested' (unchanged)
    processing -- orders.status -> 'return_processing'
    approved  -- orders.status -> 'return_approved'
                + orders.payment_status set if refund
    rejected  -- orders.status -> 'delivered' (revert)
    fulfilled -- orders.status -> 'returned' (terminal)
*/
export type ReturnRequestState =
  | "pending"
  | "received"
  | "processing"
  | "approved"
  | "rejected"
  | "fulfilled";

/** P62: resolution chosen at the 'approved' transition. Only set
    when state = 'approved'. */
export type ReturnRequestResolution =
  | "full_refund"
  | "partial_refund"
  | "replacement";

export type ReturnRequest = {
  id: string;
  order_id: string;
  /** Nullable: Super Admin can raise on the customer's behalf. */
  requested_by: string | null;
  source: ReturnRequestSource;
  reason: ReturnRequestReason;
  customer_notes: string | null;
  state: ReturnRequestState;
  resolution: ReturnRequestResolution | null;
  /** Only set when state='approved' AND resolution='partial_refund'.
      Auto-computed server-side from the return_request_items'
      unit_price × quantity when not explicitly provided. */
  resolution_amount: number | null;
  /** Placeholder for the future payment-gateway integration. The
      Manager pastes the gateway-side refund id here when the
      refund is actually applied. */
  gateway_refund_id: string | null;
  manager_notes: string | null;
  decided_by: string | null;
  decided_at: string | null;
  fulfilled_at: string | null;
  /** P62: SLA audit column. Stamped at create time so the
      activity_log row 'request created' includes the age context
      without joining to orders.delivered_at. NULL for Manager-raised
      requests (they bypass the SLA). */
  delivered_at_at_request: string | null;
  created_at: string;
  updated_at: string;
};

/** P62 (amendment): child row identifying a specific order_item
    and quantity being returned. A return request can include
    multiple items (partial return of N out of M products in the
    order). One order_item can appear in multiple return requests
    (e.g., customer escalates from partial to full refund), so
    no UNIQUE constraint on order_item_id. */
export type ReturnRequestItem = {
  id: string;
  return_request_id: string;
  order_item_id: string;
  quantity: number;
  created_at: string;
  order_items: {
    product_name: string | null;
    variant_name: string | null;
    unit_price: number | null;
  } | null;
};

export type SupportTicket = {
  id: string;
  user_id: string;
  store_id: string | null;
  subject: string;
  message: string;
  status: "open" | "in_progress" | "resolved" | "closed";
  priority: "low" | "medium" | "high" | "urgent";
  assigned_to: string | null;
  admin_response: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
};
