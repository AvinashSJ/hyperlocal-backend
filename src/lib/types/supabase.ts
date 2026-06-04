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
  status: "pending" | "confirmed" | "processing" | "out_for_delivery" | "delivered" | "cancelled" | "returned";
  subtotal: number;
  discount_amount: number;
  tax_amount: number;
  delivery_charge: number;
  total_amount: number;
  payment_status: "unpaid" | "paid" | "partial" | "refunded";
  payment_method: "cod" | "card" | "upi" | "netbanking" | "wallet" | null;
  delivery_address_id: string | null;
  delivery_slot_id: string | null;
  delivery_date: string | null;
  placed_at: string;
  created_at: string;
  updated_at: string;
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
