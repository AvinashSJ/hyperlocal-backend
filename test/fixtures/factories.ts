let counter = 0;
function uid(prefix: string): string {
  counter += 1;
  return `${prefix}-${Date.now().toString(36)}-${counter}`;
}

function nowISO(): string {
  return new Date().toISOString();
}

export function makeProfile(overrides: Partial<{
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  avatar_url: string | null;
  role: "customer" | "admin" | "superadmin";
  role_id: number | null;
  is_active: boolean;
  store_id: string | null;
  staff_type: string | null;
  created_at: string;
  updated_at: string;
}> = {}) {
  return {
    id: overrides.id ?? uid("profile"),
    full_name: overrides.full_name ?? "Test User",
    email: overrides.email ?? "user@example.com",
    phone: overrides.phone ?? "+919999999999",
    avatar_url: overrides.avatar_url ?? null,
    role: overrides.role ?? "admin",
    role_id: overrides.role_id ?? null,
    is_active: overrides.is_active ?? true,
    store_id: overrides.store_id ?? null,
    staff_type: overrides.staff_type ?? null,
    created_at: overrides.created_at ?? nowISO(),
    updated_at: overrides.updated_at ?? nowISO(),
  };
}

export function makeStore(overrides: Partial<{
  id: string;
  name: string;
  slug: string;
  // P43: short unique code for per-store invoice numbering.
  // Defaults to the first 8 chars of the id uppercased, matching
  // the migration backfill.
  code: string;
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
  is_active: boolean;
  is_open: boolean;
  created_at: string;
  updated_at: string;
}> = {}) {
  return {
    id: overrides.id ?? uid("store"),
    name: overrides.name ?? "Test Store",
    slug: overrides.slug ?? "test-store",
    code: overrides.code ?? (overrides.id ?? uid("store")).substring(0, 8).toUpperCase(),
    logo_url: overrides.logo_url ?? null,
    banner_url: overrides.banner_url ?? null,
    owner_id: overrides.owner_id ?? null,
    phone: overrides.phone ?? "+919999999999",
    email: overrides.email ?? "store@example.com",
    address: overrides.address ?? "123 Test St",
    city: overrides.city ?? "Bangalore",
    state: overrides.state ?? "KA",
    lat: overrides.lat ?? null,
    lng: overrides.lng ?? null,
    delivery_radius_km: overrides.delivery_radius_km ?? 5,
    commission_rate: overrides.commission_rate ?? 10,
    is_active: overrides.is_active ?? true,
    is_open: overrides.is_open ?? true,
    created_at: overrides.created_at ?? nowISO(),
    updated_at: overrides.updated_at ?? nowISO(),
  };
}

export function makeCategory(overrides: Partial<{
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
}> = {}) {
  const name = overrides.name ?? "Test Category";
  return {
    id: overrides.id ?? uid("cat"),
    name,
    slug: overrides.slug ?? name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    description: overrides.description ?? null,
    image_url: overrides.image_url ?? null,
    parent_id: overrides.parent_id ?? null,
    is_featured: overrides.is_featured ?? false,
    sort_order: overrides.sort_order ?? 0,
    is_active: overrides.is_active ?? true,
    created_at: overrides.created_at ?? nowISO(),
  };
}

export function makeProduct(overrides: Partial<{
  id: string;
  name: string;
  description: string | null;
  sku: string | null;
  barcode: string | null;
  category_id: string | null;
  brand: string | null;
  unit_of_measurement: "kg" | "g" | "liter" | "ml" | "piece" | "pack" | "dozen";
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
  status: "active" | "inactive" | "out_of_stock";
  store_id: string | null;
  created_at: string;
  updated_at: string;
}> = {}) {
  return {
    id: overrides.id ?? uid("prod"),
    name: overrides.name ?? "Test Product",
    description: overrides.description ?? null,
    sku: overrides.sku ?? null,
    barcode: overrides.barcode ?? null,
    category_id: overrides.category_id ?? null,
    brand: overrides.brand ?? null,
    unit_of_measurement: overrides.unit_of_measurement ?? "piece",
    mrp: overrides.mrp ?? 100,
    selling_price: overrides.selling_price ?? 80,
    discount_percent: overrides.discount_percent ?? 20,
    gst_rate: overrides.gst_rate ?? 18,
    hsn_code: overrides.hsn_code ?? null,
    is_gst_exempted: overrides.is_gst_exempted ?? false,
    min_order_qty: overrides.min_order_qty ?? 1,
    max_order_qty: overrides.max_order_qty ?? null,
    stock_quantity: overrides.stock_quantity ?? 50,
    low_stock_threshold: overrides.low_stock_threshold ?? 10,
    status: overrides.status ?? "active",
    store_id: overrides.store_id ?? null,
    created_at: overrides.created_at ?? nowISO(),
    updated_at: overrides.updated_at ?? nowISO(),
  };
}

export function makeProductVariant(overrides: Partial<{
  id: string;
  product_id: string;
  name: string;
  sku: string | null;
  price: number;
  stock: number;
  variant_attributes: Record<string, unknown> | null;
  created_at: string;
}> = {}) {
  return {
    id: overrides.id ?? uid("var"),
    product_id: overrides.product_id ?? uid("prod"),
    name: overrides.name ?? "Default Variant",
    sku: overrides.sku ?? null,
    price: overrides.price ?? 80,
    stock: overrides.stock ?? 20,
    variant_attributes: overrides.variant_attributes ?? null,
    created_at: overrides.created_at ?? nowISO(),
  };
}

export function makeProductImage(overrides: Partial<{
  id: string;
  product_id: string;
  image_url: string;
  is_primary: boolean;
  sort_order: number;
  uploaded_at: string;
}> = {}) {
  return {
    id: overrides.id ?? uid("img"),
    product_id: overrides.product_id ?? uid("prod"),
    image_url: overrides.image_url ?? "https://test.supabase.co/storage/v1/object/public/product-images/test.jpg",
    is_primary: overrides.is_primary ?? true,
    sort_order: overrides.sort_order ?? 0,
    uploaded_at: overrides.uploaded_at ?? nowISO(),
  };
}

export function makeOrderItem(overrides: Partial<{
  id: string;
  product_id: string;
  variant_id: string | null;
  quantity: number;
  unit_price: number;
  total_price: number;
  gst_rate: number;
  gst_amount: number;
  status: string;
  category_id: string | null;
  products: { name: string; sku: string | null } | null;
  product_variants: { name: string } | null;
  // P26: snapshot fields (added by migration 20260620000002)
  product_name: string | null;
  product_sku: string | null;
  variant_name: string | null;
  product_hsn_code: string | null;
}> = {}) {
  const productId = overrides.product_id ?? uid("prod");
  return {
    id: overrides.id ?? uid("oi"),
    product_id: overrides.product_id ?? productId,
    variant_id: overrides.variant_id ?? null,
    quantity: overrides.quantity ?? 1,
    unit_price: overrides.unit_price ?? 100,
    total_price: overrides.total_price ?? 100,
    gst_rate: overrides.gst_rate ?? 18,
    gst_amount: overrides.gst_amount ?? 18,
    status: overrides.status ?? "pending",
    category_id: overrides.category_id ?? null,
    products: overrides.products ?? null,
    product_variants: overrides.product_variants ?? null,
    // P26 snapshots — default to "Test Product" / "TP-001" so tests reflect a
    // realistic order where the product was named at order time.
    product_name: overrides.product_name ?? "Test Product",
    product_sku: overrides.product_sku ?? "TP-001",
    variant_name: overrides.variant_name ?? null,
    product_hsn_code: overrides.product_hsn_code ?? "1234",
  };
}

export function makeOrder(overrides: Partial<{
  id: string;
  order_number: string;
  user_id: string;
  store_id: string | null;
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
  // P39: invoice_id is the FK from the generated invoice back to
  // the order. P44 tests use it to assert idempotency in
  // auto-invoice generation.
  invoice_id: string | null;
  placed_at: string;
  created_at: string;
  updated_at: string;
}> = {}) {
  return {
    id: overrides.id ?? uid("order"),
    order_number: overrides.order_number ?? `ORD-${Date.now()}`,
    user_id: overrides.user_id ?? uid("user"),
    store_id: overrides.store_id ?? null,
    status: overrides.status ?? "pending",
    subtotal: overrides.subtotal ?? 100,
    discount_amount: overrides.discount_amount ?? 0,
    tax_amount: overrides.tax_amount ?? 18,
    delivery_charge: overrides.delivery_charge ?? 0,
    total_amount: overrides.total_amount ?? 118,
    payment_status: overrides.payment_status ?? "unpaid",
    payment_method: overrides.payment_method ?? "cod",
    delivery_address_id: overrides.delivery_address_id ?? null,
    delivery_slot_id: overrides.delivery_slot_id ?? null,
    delivery_date: overrides.delivery_date ?? null,
    invoice_id: overrides.invoice_id ?? null,
    placed_at: overrides.placed_at ?? nowISO(),
    created_at: overrides.created_at ?? nowISO(),
    updated_at: overrides.updated_at ?? nowISO(),
  };
}

export function makeOrderTrack(overrides: Partial<{
  id: string;
  order_id: string;
  status: string;
  notes: string | null;
  created_by: string | null;
  created_at: string;
}> = {}) {
  return {
    id: overrides.id ?? uid("track"),
    order_id: overrides.order_id ?? uid("order"),
    status: overrides.status ?? "pending",
    notes: overrides.notes ?? null,
    created_by: overrides.created_by ?? null,
    created_at: overrides.created_at ?? nowISO(),
  };
}

export function makeInvoice(overrides: Partial<{
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
  amount_in_words: string | null;
  status: "generated" | "sent" | "paid" | "cancelled";
  pdf_url: string | null;
  invoice_date: string;
  created_at: string;
}> = {}) {
  return {
    id: overrides.id ?? uid("inv"),
    order_id: overrides.order_id ?? uid("order"),
    gstin_id: overrides.gstin_id ?? null,
    invoice_number: overrides.invoice_number ?? `INV-${new Date().getFullYear()}-0001`,
    invoice_type: overrides.invoice_type ?? "original",
    taxable_amount: overrides.taxable_amount ?? 100,
    cgst: overrides.cgst ?? 9,
    sgst: overrides.sgst ?? 9,
    igst: overrides.igst ?? null,
    total_amount: overrides.total_amount ?? 118,
    amount_in_words: overrides.amount_in_words ?? null,
    status: overrides.status ?? "generated",
    pdf_url: overrides.pdf_url ?? null,
    invoice_date: overrides.invoice_date ?? nowISO(),
    created_at: overrides.created_at ?? nowISO(),
  };
}

export function makeBanner(overrides: Partial<{
  id: string;
  name: string;
  link: string | null;
  image_url: string | null;
  position: number;
  is_active: boolean;
  store_id: string | null;
  created_at: string;
  updated_at: string;
}> = {}) {
  return {
    id: overrides.id ?? uid("banner"),
    name: overrides.name ?? "Test Banner",
    link: overrides.link ?? null,
    image_url: overrides.image_url ?? null,
    position: overrides.position ?? 0,
    is_active: overrides.is_active ?? true,
    store_id: overrides.store_id ?? null,
    created_at: overrides.created_at ?? nowISO(),
    updated_at: overrides.updated_at ?? nowISO(),
  };
}

export function makeRole(overrides: Partial<{
  id: number;
  name: string;
  description: string | null;
  permissions: Record<string, string[]>;
  is_system: boolean;
  created_at: string;
  updated_at: string;
}> = {}) {
  return {
    id: overrides.id ?? Math.floor(Math.random() * 10000),
    name: overrides.name ?? "Test Role",
    description: overrides.description ?? null,
    permissions: overrides.permissions ?? {},
    is_system: overrides.is_system ?? false,
    created_at: overrides.created_at ?? nowISO(),
    updated_at: overrides.updated_at ?? nowISO(),
  };
}

export function makeNotification(overrides: Partial<{
  id: string;
  user_id: string;
  title: string;
  body: string;
  type: "order" | "promo" | "system";
  is_read: boolean;
  read_at: string | null;
  data: Record<string, unknown> | null;
  created_at: string;
}> = {}) {
  return {
    id: overrides.id ?? uid("notif"),
    user_id: overrides.user_id ?? uid("user"),
    title: overrides.title ?? "Test Notification",
    body: overrides.body ?? "Body",
    type: overrides.type ?? "system",
    is_read: overrides.is_read ?? false,
    read_at: overrides.read_at ?? null,
    data: overrides.data ?? null,
    created_at: overrides.created_at ?? nowISO(),
  };
}

export function makeDeliveryZone(overrides: Partial<{
  id: string;
  store_id: string | null;
  name: string;
  pincodes: string[];
  radius_km: number | null;
  delivery_charge: number;
  free_delivery_min_order: number | null;
  is_active: boolean;
  is_express: boolean;
  created_at: string;
}> = {}) {
  return {
    id: overrides.id ?? uid("zone"),
    store_id: overrides.store_id ?? null,
    name: overrides.name ?? "Test Zone",
    pincodes: overrides.pincodes ?? ["560001", "560002"],
    radius_km: overrides.radius_km ?? 5,
    delivery_charge: overrides.delivery_charge ?? 30,
    free_delivery_min_order: overrides.free_delivery_min_order ?? 200,
    is_active: overrides.is_active ?? true,
    is_express: overrides.is_express ?? false,
    created_at: overrides.created_at ?? nowISO(),
  };
}

export function makeDeliverySlot(overrides: Partial<{
  id: string;
  zone_id: string | null;
  name: string;
  start_time: string;
  end_time: string;
  available_days: number[];
  capacity: number;
  is_active: boolean;
  created_at: string;
}> = {}) {
  return {
    id: overrides.id ?? uid("slot"),
    zone_id: overrides.zone_id ?? null,
    name: overrides.name ?? "Morning Slot",
    start_time: overrides.start_time ?? "08:00",
    end_time: overrides.end_time ?? "10:00",
    available_days: overrides.available_days ?? [1, 2, 3, 4, 5],
    capacity: overrides.capacity ?? 50,
    is_active: overrides.is_active ?? true,
    created_at: overrides.created_at ?? nowISO(),
  };
}

export function makeGstNumber(overrides: Partial<{
  id: string;
  store_id: string | null;
  gstin: string;
  legal_name: string;
  business_address: string | null;
  state_code: string | null;
  is_primary: boolean;
  is_active: boolean;
  current_turnover?: number;
  financial_year?: string;
  threshold_amount?: number;
  created_at: string;
}> = {}) {
  return {
    id: overrides.id ?? uid("gst"),
    store_id: overrides.store_id ?? null,
    gstin: overrides.gstin ?? "29ABCDE1234F1Z5",
    legal_name: overrides.legal_name ?? "Test Legal Name",
    business_address: overrides.business_address ?? "123 Test St",
    state_code: overrides.state_code ?? "29",
    is_primary: overrides.is_primary ?? true,
    is_active: overrides.is_active ?? true,
    current_turnover: overrides.current_turnover ?? 0,
    financial_year: overrides.financial_year ?? "2025-2026",
    threshold_amount: overrides.threshold_amount ?? 0,
    created_at: overrides.created_at ?? nowISO(),
  };
}

export function makeCommission(overrides: Partial<{
  id: string;
  store_id: string;
  store_name?: string | null;
  period_start: string;
  period_end: string;
  total_revenue: number;
  commission_rate: number;
  commission_amount: number;
  balance_due: number;
  status: "unpaid" | "partially_paid" | "paid";
  notes: string | null;
  created_by?: string | null;
  created_at: string;
}> = {}) {
  return {
    id: overrides.id ?? uid("comm"),
    store_id: overrides.store_id ?? uid("store"),
    store_name: overrides.store_name ?? null,
    period_start: overrides.period_start ?? "2025-01-01",
    period_end: overrides.period_end ?? "2025-01-31",
    total_revenue: overrides.total_revenue ?? 10000,
    commission_rate: overrides.commission_rate ?? 10,
    commission_amount: overrides.commission_amount ?? 1000,
    balance_due: overrides.balance_due ?? 1000,
    status: overrides.status ?? "unpaid",
    notes: overrides.notes ?? null,
    created_by: overrides.created_by ?? null,
    created_at: overrides.created_at ?? nowISO(),
  };
}

export function makeCommissionPayment(overrides: Partial<{
  id: string;
  commission_id: string;
  amount: number;
  notes: string | null;
  created_by: string | null;
  created_by_name?: string | null;
  created_at: string;
}> = {}) {
  return {
    id: overrides.id ?? uid("cp"),
    commission_id: overrides.commission_id ?? uid("comm"),
    amount: overrides.amount ?? 500,
    notes: overrides.notes ?? null,
    created_by: overrides.created_by ?? null,
    created_by_name: overrides.created_by_name ?? null,
    created_at: overrides.created_at ?? nowISO(),
  };
}

export function makeInventoryLog(overrides: Partial<{
  id: string;
  product_id: string;
  variant_id: string | null;
  change_type: string;
  quantity_before: number;
  quantity_after: number;
  quantity_change: number;
  reason: string | null;
  created_at: string;
  product_name?: string;
  variant_name?: string | null;
  store_id?: string | null;
}> = {}) {
  return {
    id: overrides.id ?? uid("invlog"),
    product_id: overrides.product_id ?? uid("prod"),
    variant_id: overrides.variant_id ?? null,
    change_type: overrides.change_type ?? "manual_adjustment",
    quantity_before: overrides.quantity_before ?? 100,
    quantity_after: overrides.quantity_after ?? 90,
    quantity_change: overrides.quantity_change ?? -10,
    reason: overrides.reason ?? null,
    created_at: overrides.created_at ?? nowISO(),
    product_name: overrides.product_name,
    variant_name: overrides.variant_name,
    store_id: overrides.store_id,
  };
}

export function makeAddress(overrides: Partial<{
  id: string;
  user_id: string;
  full_name: string;
  phone: string;
  address_line1: string;
  address_line2: string | null;
  landmark: string | null;
  city: string;
  state: string;
  pincode: string;
}> = {}) {
  return {
    id: overrides.id ?? uid("addr"),
    user_id: overrides.user_id ?? uid("user"),
    full_name: overrides.full_name ?? "Test User",
    phone: overrides.phone ?? "+919999999999",
    address_line1: overrides.address_line1 ?? "123 Test St",
    address_line2: overrides.address_line2 ?? null,
    landmark: overrides.landmark ?? null,
    city: overrides.city ?? "Bangalore",
    state: overrides.state ?? "KA",
    pincode: overrides.pincode ?? "560001",
  };
}

export function makeSetting(overrides: Partial<{
  id: string;
  key: string;
  value: Record<string, unknown>;
  group_name: "store" | "payment" | "notification" | "general" | "gst";
  created_at: string;
  updated_at: string;
}> = {}) {
  return {
    id: overrides.id ?? uid("set"),
    key: overrides.key ?? "store_policies",
    value: overrides.value ?? {},
    group_name: overrides.group_name ?? "store",
    created_at: overrides.created_at ?? nowISO(),
    updated_at: overrides.updated_at ?? nowISO(),
  };
}
