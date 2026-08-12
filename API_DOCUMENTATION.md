# Hyperlocal Backend — API Documentation

> **Flutter App Reference**
> Supabase Project: `xjmngvxbaxlutupqavdr`
> Base URL: `https://xjmngvxbaxlutupqavdr.supabase.co`
> Admin API: `https://<your-domain>/api/`

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Authentication](#2-authentication)
3. [Database Tables (Flutter-Accessible)](#3-database-tables-flutter-accessible)
4. [Row-Level Security Policies](#4-row-level-security-policies)
5. [Supabase RPC Functions](#5-supabase-rpc-functions)
6. [REST API Endpoints](#6-rest-api-endpoints)
7. [Server Actions (Admin Only)](#7-server-actions-admin-only)
8. [Realtime Subscriptions](#8-realtime-subscriptions)
9. [Data Types Reference](#9-data-types-reference)

---

## 1. Architecture Overview

This backend has two layers:

| Layer | Consumer | Auth | Access Method |
|-------|----------|------|---------------|
| **Supabase (PostgREST)** | Flutter app | Anon key + user JWT | Direct Supabase client queries |
| **Next.js API Routes** | Flutter app | Public or admin JWT | HTTP REST endpoints |
| **Next.js Server Actions** | Admin panel only | Service role (admin session) | Not accessible from Flutter |

The Flutter app talks **directly to Supabase** for all CRUD operations on customer-facing tables. RLS policies enforce that customers can only read/write their own data. The Next.js server exposes a small number of REST endpoints for features that require server-side logic (delivery charge calculation, maintenance status, file upload, invoice PDF).

---

## 2. Authentication

The Flutter app authenticates via **Supabase Auth** (email/password, phone/OTP). On successful login, the user receives a JWT that is passed with every Supabase request. RLS policies use `auth.uid()` to scope data access.

### User Roles

| Role | Description | Table: `profiles.role` |
|------|-------------|----------------------|
| `customer` | End user (Flutter app) | `"customer"` |
| `admin` | Store Manager | `"admin"` |
| `superadmin` | Platform administrator | `"superadmin"` |

---

## 3. Database Tables (Flutter-Accessible)

These are the tables the Flutter app reads/writes directly via Supabase client.

### 3.1 `profiles`

Customer and admin profiles. The user's own row.

| Column | Type | Nullable | Notes |
|--------|------|----------|-------|
| `id` | `uuid` PK | no | = `auth.uid()` |
| `full_name` | `text` | no | Display name |
| `phone` | `text` | yes | |
| `email` | `text` | yes | |
| `avatar_url` | `text` | yes | |
| `role` | `text` | no | `"customer"` / `"admin"` / `"superadmin"` |
| `created_at` | `timestamptz` | no | Default: `now()` |
| `updated_at` | `timestamptz` | no | |

### 3.2 `stores`

| Column | Type | Nullable | Notes |
|--------|------|----------|-------|
| `id` | `uuid` PK | no | |
| `name` | `text` | no | |
| `slug` | `text` | no | URL-friendly |
| `code` | `text` | yes | Short code for invoice numbering (e.g. `"FARM"`) |
| `logo_url` | `text` | yes | |
| `banner_url` | `text` | yes | |
| `owner_id` | `uuid` FK→profiles | yes | |
| `phone` | `text` | yes | |
| `email` | `text` | yes | |
| `address` | `text` | yes | |
| `city` | `text` | yes | |
| `state` | `text` | yes | |
| `pincode` | `text` | yes | |
| `lat` | `double precision` | yes | |
| `lng` | `double precision` | yes | |
| `delivery_radius_km` | `numeric` | yes | |
| `commission_rate` | `numeric` | yes | Percentage |
| `order_id_prefix` | `text` | yes | e.g. `"FARM"` → order numbers like `FARM-000001` |
| `is_active` | `boolean` | no | Default: `true` |
| `is_open` | `boolean` | no | Whether store is accepting orders now |
| `created_at` | `timestamptz` | no | |

### 3.3 `categories`

| Column | Type | Nullable | Notes |
|--------|------|----------|-------|
| `id` | `uuid` PK | no | |
| `name` | `text` | no | |
| `slug` | `text` | no | |
| `description` | `text` | yes | |
| `image_url` | `text` | yes | |
| `parent_id` | `uuid` FK→categories | yes | Self-referencing for subcategories |
| `is_featured` | `boolean` | no | Default: `false` |
| `sort_order` | `integer` | no | Default: `0` |
| `is_active` | `boolean` | no | Default: `true` |
| `created_at` | `timestamptz` | no | |

### 3.4 `products`

| Column | Type | Nullable | Notes |
|--------|------|----------|-------|
| `id` | `uuid` PK | no | |
| `name` | `text` | no | |
| `description` | `text` | yes | |
| `sku` | `text` | yes | |
| `barcode` | `text` | yes | |
| `category_id` | `uuid` FK→categories | yes | |
| `brand` | `text` | yes | |
| `unit_of_measurement` | `text` | no | One of: `kg`, `gram`, `ml`, `ltr`, `pcs`, `pack`, `dozen`, `box`, `bundle`, `pouch`, `unit`, `tin` |
| `mrp` | `numeric` | no | Maximum retail price |
| `selling_price` | `numeric` | no | |
| `discount_percent` | `numeric` | no | Default: `0` |
| `gst_rate` | `integer` | no | `0`, `5`, `12`, `18`, or `28` |
| `hsn_code` | `text` | yes | |
| `is_gst_exempted` | `boolean` | no | Default: `false` |
| `min_order_qty` | `numeric` | no | Default: `1` |
| `max_order_qty` | `numeric` | yes | NULL = unlimited |
| `stock_quantity` | `numeric` | no | Default: `0` |
| `low_stock_threshold` | `numeric` | yes | |
| `purchase_rate` | `numeric` | yes | Cost price |
| `status` | `text` | no | `"active"` / `"inactive"` / `"out_of_stock"` |
| `store_id` | `uuid` FK→stores | yes | NULL = super-admin product |
| `created_at` | `timestamptz` | no | |
| `updated_at` | `timestamptz` | no | |
| `avg_rating` | `numeric` | yes | Auto-computed by trigger |
| `review_count` | `integer` | yes | Auto-computed by trigger |

### 3.5 `product_variants`

| Column | Type | Nullable | Notes |
|--------|------|----------|-------|
| `id` | `uuid` PK | no | |
| `product_id` | `uuid` FK→products | no | CASCADE delete |
| `name` | `text` | no | e.g. "500g", "1kg" |
| `sku` | `text` | yes | |
| `price` | `numeric` | no | |
| `stock` | `numeric` | no | Default: `0` |
| `variant_attributes` | `jsonb` | yes | e.g. `{"weight": "500g"}` |
| `created_at` | `timestamptz` | no | |

### 3.6 `product_images`

| Column | Type | Nullable | Notes |
|--------|------|----------|-------|
| `id` | `uuid` PK | no | |
| `product_id` | `uuid` FK→products | no | |
| `image_url` | `text` | no | |
| `is_primary` | `boolean` | no | Default: `false` |
| `sort_order` | `integer` | no | Default: `0` |
| `uploaded_at` | `timestamptz` | no | |

### 3.7 `addresses`

Customer delivery addresses.

| Column | Type | Nullable | Notes |
|--------|------|----------|-------|
| `id` | `uuid` PK | no | |
| `user_id` | `uuid` FK→profiles | no | |
| `full_name` | `text` | no | |
| `phone` | `text` | no | |
| `address_line1` | `text` | no | |
| `address_line2` | `text` | yes | |
| `landmark` | `text` | yes | |
| `city` | `text` | no | |
| `state` | `text` | no | |
| `pincode` | `text` | no | |
| `lat` | `double precision` | yes | |
| `lng` | `double precision` | yes | |
| `is_default` | `boolean` | no | Default: `false` |

### 3.8 `orders`

| Column | Type | Nullable | Notes |
|--------|------|----------|-------|
| `id` | `uuid` PK | no | |
| `order_number` | `text` | no | Auto-generated: `{PREFIX}-{SEQ:06d}` via trigger |
| `user_id` | `uuid` FK→profiles | no | |
| `cart_id` | `uuid` | yes | Groups multi-store sub-orders from one checkout |
| `store_id` | `uuid` FK→stores | yes | Auto-set by `set_order_store_id()` trigger |
| `status` | `text` | no | See status flow below |
| `subtotal` | `numeric` | no | |
| `discount_amount` | `numeric` | no | Default: `0` |
| `tax_amount` | `numeric` | no | Default: `0` |
| `delivery_charge` | `numeric` | no | Default: `0` |
| `total_amount` | `numeric` | no | |
| `payment_status` | `text` | no | `"unpaid"` / `"paid"` / `"partially_refunded"` / `"refunded"` |
| `payment_method` | `text` | yes | `"cod"` / `"card"` / `"upi"` / `"netbanking"` / `"wallet"` |
| `delivery_address_id` | `uuid` FK→addresses | yes | |
| `delivery_slot_id` | `uuid` FK→delivery_slots | yes | |
| `delivery_date` | `text` | yes | Date string |
| `gstin` | `text` | yes | Buyer GSTIN (if applicable) |
| `confirmed_at` | `timestamptz` | yes | Set when status → `confirmed` |
| `delivered_at` | `timestamptz` | yes | Set when status → `delivered` |
| `invoice_id` | `uuid` FK→invoices | yes | Auto-generated on `processing` |
| `placed_at` | `timestamptz` | no | Set by Flutter at order creation |
| `created_at` | `timestamptz` | no | |
| `updated_at` | `timestamptz` | no | |

**Order Status Flow:**
```
pending → confirmed → processing → out_for_delivery → delivered
                                                        ↓
                                                   return_requested → return_processing → return_approved → returned
                                                        ↓                                       ↓
                                                     cancelled                            return_rejected
```

### 3.9 `order_items`

| Column | Type | Nullable | Notes |
|--------|------|----------|-------|
| `id` | `uuid` PK | no | |
| `order_id` | `uuid` FK→orders | no | |
| `product_id` | `uuid` FK→products | yes | SET NULL on product deletion |
| `variant_id` | `uuid` FK→product_variants | yes | SET NULL on variant deletion |
| `quantity` | `numeric` | no | |
| `unit_price` | `numeric` | no | |
| `total_price` | `numeric` | no | |
| `gst_rate` | `numeric` | no | |
| `gst_amount` | `numeric` | no | |
| `status` | `text` | no | |
| `category_id` | `uuid` FK→categories | yes | |
| `product_name` | `text` | yes | P26 snapshot (auto-populated by trigger) |
| `product_sku` | `text` | yes | P26 snapshot |
| `variant_name` | `text` | yes | P26 snapshot |
| `product_hsn_code` | `text` | yes | P26 snapshot |
| `created_at` | `timestamptz` | no | |

### 3.10 `order_tracks`

Order status timeline entries.

| Column | Type | Nullable | Notes |
|--------|------|----------|-------|
| `id` | `uuid` PK | no | |
| `order_id` | `uuid` FK→orders | no | CASCADE delete |
| `status` | `text` | no | The status that was set |
| `notes` | `text` | yes | Optional comment |
| `created_by` | `uuid` FK→auth.users | yes | NULL for system-created |
| `created_at` | `timestamptz` | no | |

### 3.11 `delivery_zones`

| Column | Type | Nullable | Notes |
|--------|------|----------|-------|
| `id` | `uuid` PK | no | |
| `store_id` | `uuid` FK→stores | yes | |
| `name` | `text` | no | e.g. "Zone A — 3km" |
| `pincodes` | `text[]` | yes | Array of pin codes |
| `radius_km` | `numeric` | yes | For radius-based zones |
| `delivery_charge` | `numeric` | no | Default: `0` |
| `free_delivery_min_order` | `numeric` | yes | |
| `is_active` | `boolean` | no | Default: `true` |
| `is_express` | `boolean` | no | Default: `false` |
| `boundary` | `jsonb` | yes | PostGIS polygon as GeoJSON |
| `created_at` | `timestamptz` | no | |

### 3.12 `delivery_slots`

| Column | Type | Nullable | Notes |
|--------|------|----------|-------|
| `id` | `uuid` PK | no | |
| `zone_id` | `uuid` FK→delivery_zones | yes | |
| `store_id` | `uuid` FK→stores | yes | |
| `name` | `text` | no | e.g. "Morning 9-12" |
| `start_time` | `text` | no | e.g. `"09:00"` |
| `end_time` | `text` | no | e.g. `"12:00"` |
| `available_days` | `integer[]` | no | 0=Sun, 1=Mon, ... 6=Sat |
| `capacity` | `integer` | no | Max orders per slot |
| `is_active` | `boolean` | no | Default: `true` |
| `created_at` | `timestamptz` | no | |

### 3.13 `notifications`

| Column | Type | Nullable | Notes |
|--------|------|----------|-------|
| `id` | `uuid` PK | no | |
| `user_id` | `uuid` FK→profiles | no | |
| `title` | `text` | no | |
| `body` | `text` | no | |
| `type` | `text` | no | `"order"` / `"promo"` / `"system"` |
| `is_read` | `boolean` | no | Default: `false` |
| `read_at` | `timestamptz` | yes | |
| `data` | `jsonb` | yes | Arbitrary payload (e.g. order_id) |
| `created_at` | `timestamptz` | no | |

### 3.14 `product_reviews`

| Column | Type | Nullable | Notes |
|--------|------|----------|-------|
| `id` | `uuid` PK | no | |
| `product_id` | `uuid` FK→products | no | |
| `user_id` | `uuid` FK→profiles | no | |
| `rating` | `integer` | no | 1–5 |
| `comment` | `text` | yes | |
| `created_at` | `timestamptz` | no | |

Trigger `update_product_rating()` auto-computes `products.avg_rating` and `products.review_count` on insert/update/delete.

### 3.15 `wishlists`

| Column | Type | Nullable | Notes |
|--------|------|----------|-------|
| `id` | `uuid` PK | no | |
| `user_id` | `uuid` FK→profiles | no | |
| `product_id` | `uuid` FK→products | no | |
| `created_at` | `timestamptz` | yes | |

Unique constraint: `(user_id, product_id)`

### 3.16 `banners`

| Column | Type | Nullable | Notes |
|--------|------|----------|-------|
| `id` | `uuid` PK | no | |
| `name` | `text` | no | |
| `link` | `text` | yes | |
| `image_url` | `text` | yes | |
| `position` | `integer` | no | Sort order |
| `is_active` | `boolean` | no | Default: `true` |
| `created_at` | `timestamptz` | no | |
| `updated_at` | `timestamptz` | no | |

### 3.17 `return_requests`

| Column | Type | Nullable | Notes |
|--------|------|----------|-------|
| `id` | `uuid` PK | no | |
| `order_id` | `uuid` FK→orders | no | |
| `requested_by` | `uuid` FK→profiles | yes | NULL for manager-raised |
| `source` | `text` | no | `"customer"` / `"manager"` |
| `reason` | `text` | no | `"damaged"` / `"wrong_item"` / `"not_as_described"` / `"size_fit"` / `"other"` |
| `customer_notes` | `text` | yes | |
| `state` | `text` | no | See workflow below |
| `resolution` | `text` | yes | `"full_refund"` / `"partial_refund"` / `"replacement"` |
| `resolution_amount` | `numeric` | yes | Auto-computed for partial_refund |
| `gateway_refund_id` | `text` | yes | Payment gateway refund reference |
| `manager_notes` | `text` | yes | |
| `decided_by` | `uuid` FK→profiles | yes | |
| `decided_at` | `timestamptz` | yes | |
| `fulfilled_at` | `timestamptz` | yes | |
| `delivered_at_at_request` | `timestamptz` | yes | SLA audit |
| `created_at` | `timestamptz` | no | |
| `updated_at` | `timestamptz` | no | |

**Return Request State Machine:**
```
pending → received → processing → approved → fulfilled
                                    ↓
                                  rejected (terminal)
```

### 3.18 `return_request_items`

| Column | Type | Nullable | Notes |
|--------|------|----------|-------|
| `id` | `uuid` PK | no | |
| `return_request_id` | `uuid` FK→return_requests | no | |
| `order_item_id` | `uuid` FK→order_items | no | |
| `quantity` | `numeric` | no | How many to return |
| `created_at` | `timestamptz` | no | |

### 3.19 `support_tickets`

| Column | Type | Nullable | Notes |
|--------|------|----------|-------|
| `id` | `uuid` PK | no | |
| `user_id` | `uuid` FK→profiles | no | |
| `store_id` | `uuid` FK→stores | yes | Auto-set by trigger from profile |
| `subject` | `text` | no | |
| `message` | `text` | no | |
| `status` | `text` | no | `"open"` / `"in_progress"` / `"resolved"` / `"closed"` |
| `priority` | `text` | no | `"low"` / `"medium"` / `"high"` / `"urgent"` |
| `assigned_to` | `uuid` FK→profiles | yes | |
| `admin_response` | `text` | yes | |
| `resolved_at` | `timestamptz` | yes | |
| `created_at` | `timestamptz` | no | |
| `updated_at` | `timestamptz` | no | |

### 3.20 `settings`

| Column | Type | Nullable | Notes |
|--------|------|----------|-------|
| `id` | `uuid` PK | no | |
| `key` | `text` | no | Unique. E.g. `"app_maintenance"`, `"store_maintenance"` |
| `value` | `jsonb` | no | |
| `group_name` | `text` | no | `"store"` / `"payment"` / `"notification"` / `"general"` / `"gst"` |
| `created_at` | `timestamptz` | no | |
| `updated_at` | `timestamptz` | no | |

---

## 4. Row-Level Security Policies

These policies protect customer data when using the **anon key** (Flutter app). The admin panel bypasses all RLS using the service role key.

### `profiles`
| Policy | Operation | Rule |
|--------|-----------|------|
| `User insert own profile` | INSERT | `auth.uid() = id` |
| `User select own profile` | SELECT | `auth.uid() = id` |
| `User update own profile` | UPDATE | `auth.uid() = id` |

### `orders`
| Policy | Operation | Rule |
|--------|-----------|------|
| `User insert own orders` | INSERT | `auth.uid() = user_id` |
| `User select own orders` | SELECT | `auth.uid() = user_id` |
| `User update own orders` | UPDATE | `auth.uid() = user_id` |

### `order_items`
| Policy | Operation | Rule |
|--------|-----------|------|
| `User insert own order items` | INSERT | Order belongs to `auth.uid()` |
| `User select own order items` | SELECT | Order belongs to `auth.uid()` |

### `order_tracks`
| Policy | Operation | Rule |
|--------|-----------|------|
| `User read own` | SELECT | Order belongs to `auth.uid()` |
| `User insert own order tracks` | INSERT | Order belongs to `auth.uid()` |

### `return_requests`
| Policy | Operation | Rule |
|--------|-----------|------|
| `Customers can insert own return requests` | INSERT | `requested_by = auth.uid()` |
| `Users see own return requests` | SELECT | `requested_by = auth.uid()` |

### `return_request_items`
| Policy | Operation | Rule |
|--------|-----------|------|
| `Users see own return request items` | SELECT | Parent return_request belongs to `auth.uid()` |

### `support_tickets`
| Policy | Operation | Rule |
|--------|-----------|------|
| `Customers can insert tickets` | INSERT | `auth.uid() = user_id` |
| `Customers can view their own tickets` | SELECT | `auth.uid() = user_id` |
| `Customers can update their own tickets` | UPDATE | `auth.uid() = user_id` |

### `product_reviews`
| Policy | Operation | Rule |
|--------|-----------|------|
| `Anyone can read reviews` | SELECT | `true` (public) |
| `Users can insert own review` | INSERT | `auth.uid() = user_id` |
| `Users can update own review` | UPDATE | `auth.uid() = user_id` |

### `wishlists`
| Policy | Operation | Rule |
|--------|-----------|------|
| `Users can view own wishlist` | SELECT | `auth.uid() = user_id` |
| `Users can insert own wishlist` | INSERT | `auth.uid() = user_id` |
| `Users can delete own wishlist` | DELETE | `auth.uid() = user_id` |

### `banners`, `activity_logs`, `store_commissions`, `commission_payments`, `store_categories`
All use `is_admin()` — **no customer access** (except `store_categories` has a public SELECT for active categories).

---

## 5. Supabase RPC Functions

Call these via `supabase.rpc('function_name', { param: value })`.

### 5.1 `get_applicable_delivery_zone`

Determines if a customer's location falls within a store's delivery zone and returns the applicable delivery charge.

```
RPC: get_applicable_delivery_zone
Params:
  p_lat    double precision   — Customer latitude
  p_lng    double precision   — Customer longitude
  p_store_id uuid             — Store UUID
Returns:
  TABLE(
    id                     uuid,
    name                   text,
    delivery_charge        numeric,
    free_delivery_min_order numeric,
    is_express             boolean
  )
```

**How it works:**
1. First tries PostGIS polygon boundary match (priority 0)
2. Falls back to radius-based proximity using `ST_DWithin` (priority 1)
3. Among radius matches, the smallest radius zone wins

**Flutter usage:**
```dart
final zone = await supabase.rpc('get_applicable_delivery_zone', params: {
  'p_lat': latitude,
  'p_lng': longitude,
  'p_store_id': storeId,
});
```

### 5.2 `decrement_stock`

Decrements product (and optionally variant) stock on order placement. Logs to `inventory_log`.

```
RPC: decrement_stock
Params:
  p_product_id  uuid              — Product UUID
  p_variant_id  uuid (optional)   — Variant UUID (NULL for non-variant products)
  p_quantity    decimal (default 1) — Quantity to decrement
Returns: void
```

**Behavior:**
- Decrements `products.stock_quantity` (floored at 0)
- Sets `products.status` to `"out_of_stock"` if stock hits 0
- Decrements `product_variants.stock` if variant_id provided
- Inserts `inventory_log` row with `reason_code: 'sale'`

> **Note:** Uses `SECURITY DEFINER` — callable by any authenticated user via RPC.

### 5.3 `demote_other_primaries`

Atomically ensures only one GST number is primary per store. Admin-only (service_role GRANT).

```
RPC: demote_other_primaries
Params:
  p_store_id   uuid — Store UUID
  p_exclude_id uuid — GST number to keep as primary
Returns: integer (count of demoted rows)
```

### 5.4 `set_zone_boundary`

Sets a delivery zone's polygon boundary from GeoJSON.

```
RPC: set_zone_boundary
Params:
  p_zone_id uuid     — Delivery zone UUID
  p_geojson jsonb    — GeoJSON Polygon
Returns: void
```

**GeoJSON format:**
```json
{
  "type": "Polygon",
  "coordinates": [[[lng1, lat1], [lng2, lat2], ..., [lng1, lat1]]]
}
```

### 5.5 `get_zone_boundary`

Returns a delivery zone's polygon as GeoJSON.

```
RPC: get_zone_boundary
Params:
  p_zone_id uuid — Delivery zone UUID
Returns: jsonb (GeoJSON or null)
```

### 5.6 `generate_order_number`

Generates sequential order number using the store's prefix.

```
RPC: generate_order_number
Params:
  p_store_id uuid — Store UUID
Returns: text (e.g. "FARM-000001")
```

**Logic:** Looks up `stores.order_id_prefix` (fallback `"ORD"`), appends `-` + zero-padded 6-digit sequence from `order_number_seq`.

### 5.7 `generate_weekly_commissions`

Scheduled via `pg_cron` (Sundays 2:30 AM UTC). Computes weekly commissions per store from delivered+paid orders.

```
RPC: generate_weekly_commissions
Params: none
Returns: void
```

---

## 6. REST API Endpoints

### 6.1 `GET /api/maintenance`

**Public** — no authentication required. Called by Flutter on launch and resume from background.

**Response:**
```json
{
  "app": {
    "enabled": false,
    "reason": "maintenance",
    "message": "",
    "etaHours": null
  },
  "stores": {
    "<storeId>": {
      "enabled": false,
      "reason": "technical",
      "message": "Store under maintenance",
      "etaHours": 2
    }
  }
}
```

| Field | Type | Notes |
|-------|------|-------|
| `enabled` | `boolean` | `true` = maintenance mode active |
| `reason` | `"maintenance"` \| `"technical"` \| `"operations"` | |
| `message` | `string` | User-facing message |
| `etaHours` | `number \| null` | Estimated hours until resolved |

**Flutter usage:**
```dart
final response = await http.get(Uri.parse('$baseUrl/api/maintenance'));
final data = jsonDecode(response.body);
if (data['app']['enabled']) {
  // Show maintenance screen
}
```

### 6.2 `POST /api/delivery/charge`

**Public** — no authentication. Calculates delivery charge for a customer location.

**Request:**
```json
{
  "latitude": 19.0760,
  "longitude": 72.8777,
  "storeId": "uuid-of-store"
}
```

**Response (eligible):**
```json
{
  "isEligible": true,
  "deliveryCharge": 30,
  "freeDeliveryMinOrder": 200,
  "zoneName": "Zone A — 3km",
  "roadDistanceKm": 2.4
}
```

**Response (not eligible):**
```json
{
  "isEligible": false
}
```

**Error:**
```json
{
  "error": "latitude, longitude (numbers) and storeId (string) are required"
}
```

| Field | Type | Notes |
|-------|------|-------|
| `isEligible` | `boolean` | Whether delivery is available |
| `deliveryCharge` | `number` | In INR (₹) |
| `freeDeliveryMinOrder` | `number` | Min order for free delivery |
| `zoneName` | `string` | Matched zone name |
| `roadDistanceKm` | `number` | Actual road distance (if Ola Maps API key configured) |

### 6.3 `POST /api/upload`

**Admin only** — requires service role. Uploads product images.

**Request:** `multipart/form-data`
| Field | Type | Notes |
|-------|------|-------|
| `files` | `File[]` | Multiple files. Max 5MB each. MIME: `image/png`, `image/jpeg`, `image/webp` |

**Response (success):**
```json
{
  "uploaded": ["1721234567-abc123.jpg"],
  "errors": []
}
```

**Response (partial):**
```json
{
  "uploaded": ["1721234567-abc123.jpg"],
  "errors": ["bad-file.png: File size exceeds limit"],
  "message": "Uploaded 1 file(s). Errors: bad-file.png: File size exceeds limit"
}
```

### 6.4 `GET /api/invoices/:id/pdf`

**Admin only** — requires `invoices:view` permission. Generates and returns an invoice PDF.

**Response:** `application/pdf` binary stream with `Content-Disposition: attachment`.

### 6.5 `POST /api/migrate-wishlist`

One-time migration endpoint. Creates the `wishlists` table with RLS policies.

---

## 7. Server Actions (Admin Only)

Server actions are `"use server"` functions called from the Next.js admin panel. **The Flutter app cannot call these directly.** They are documented here for reference on what data mutations happen server-side.

### 7.1 Orders (`orders/actions.ts`)

| Function | Params | Description |
|----------|--------|-------------|
| `getOrders(storeId?)` | `storeId?: string` | List all orders, optionally filtered by store |
| `getOrder(id)` | `id: string` | Get full order detail with items, tracks, profile, address, store |
| `updateOrderStatus(id, status, notes?)` | `id, status: OrderStatus, notes?: string` | Update order status. Sets `confirmed_at`/`delivered_at` timestamps. Auto-generates invoice on `processing`. |
| `updatePaymentStatus(id, payment_status)` | `id, payment_status: PaymentStatus` | Update payment status |
| `deleteOrder(id)` | `id: string` | Super Admin only. Deletes order + items + tracks + invoice |
| `bulkGenerateInvoices(storeId?)` | `storeId?: string` | Generate invoices for all delivered orders without one |

### 7.2 Invoices (`invoices/actions.ts`)

| Function | Params | Description |
|----------|--------|-------------|
| `getInvoices(storeId?)` | `storeId?: string` | List all invoices |
| `getInvoice(id)` | `id: string` | Get full invoice with store GSTIN, order details, items |
| `generateInvoice(orderId)` | `orderId: string` | Generate invoice for a delivered order. Returns invoice ID. |

### 7.3 Return Requests (`returns/actions.ts`)

| Function | Params | Description |
|----------|--------|-------------|
| `createReturnRequest({orderId, source, reason, customerNotes, items})` | See below | Raise a return request |
| `updateReturnRequestState(id, newState, {resolution, resolutionAmount, managerNotes})` | See below | Transition return request through workflow |

**`createReturnRequest` params:**
```typescript
{
  orderId: string;
  source: "customer" | "manager";
  reason: "damaged" | "wrong_item" | "not_as_described" | "size_fit" | "other";
  customerNotes?: string;
  items: Array<{
    order_item_id: string;
    quantity: number;
  }>;
}
```

**24-hour SLA:** Customer-raised requests must be filed within 24h of `delivered_at`. Manager-raised requests bypass this check.

**`updateReturnRequestState` params:**
```typescript
{
  id: string;
  newState: ReturnRequestState;
  resolution?: "full_refund" | "partial_refund" | "replacement";
  resolutionAmount?: number;
  managerNotes?: string;
}
```

### 7.4 Support Tickets (`support/actions.ts`)

| Function | Params | Description |
|----------|--------|-------------|
| `getSupportTickets()` | none | List tickets (store-scoped for Manager) |
| `getSupportTicket(id)` | `id: string` | Get ticket detail |
| `updateSupportTicketStatus(id, status, adminResponse?)` | `id, status, notes?` | Update ticket status |
| `assignSupportTicket(id, assignedTo)` | `id, userId` | Assign ticket to staff |

### 7.5 Products (`products/actions.ts`)

| Function | Params | Description |
|----------|--------|-------------|
| `getProducts(options)` | `{ storeId?, page?, pageSize?, search?, categoryIds?, status?, lowStockOnly? }` | List products with category names; server-side filters + pagination. Returns `{ products, total }` |
| `createProduct(formData)` | FormData | Create product (admin panel) |
| `updateProduct(id, formData)` | `id, FormData` | Update product |
| `deleteProduct(id)` | `id: string` | Delete product (cascades to variants, images) |
| `bulkImportProducts(rows)` | `rows: CSV row[]` | Bulk import from CSV |

### 7.6 Other Admin Actions

| Module | Key Functions | Notes |
|--------|---------------|-------|
| `categories/` | CRUD actions | Manager cannot create/delete |
| `stores/` | `getStoreRelations(storeId)` — returns customers, orders, invoices per store | |
| `customers/` | `getCustomers(storeId?)` — customer list with order counts | |
| `dashboard/` | `getDashboardStats(storeId?)` — today's orders, revenue, monthly data, low stock | |
| `notifications/` | Send notifications to users | |
| `staff/` | CRUD for staff members | |

---

## 8. Realtime Subscriptions

The following tables have Realtime enabled (via `supabase_realtime` publication):

| Table | Use Case |
|-------|----------|
| `orders` | Live order status updates for customer |
| `order_tracks` | Live timeline updates |
| `notifications` | Push notification triggers |

**Flutter usage:**
```dart
supabase
  .from('orders')
  .stream(primaryKey: ['id'])
  .eq('user_id', currentUserId)
  .listen((data) {
    // Handle real-time order updates
  });
```

---

## 9. Data Types Reference

### Order Status Enum
```
pending | confirmed | processing | out_for_delivery | delivered |
cancelled | returned | return_requested | return_processing |
return_approved | return_rejected
```

### Payment Status Enum
```
unpaid | paid | partially_refunded | refunded
```

### Payment Methods
```
cod | card | upi | netbanking | wallet | null
```

### Unit of Measurement
```
kg | gram | ml | ltr | pcs | pack | dozen | box | bundle | pouch | unit | tin
```

### GST Rates
```
0 | 5 | 12 | 18 | 28 | 40
```

### Return Request Reasons
```
damaged | wrong_item | not_as_described | size_fit | other
```

### Return Request States
```
pending → received → processing → approved → fulfilled
                                        ↘ rejected
```

### Support Ticket Status
```
open | in_progress | resolved | closed
```

### Support Ticket Priority
```
low | medium | high | urgent
```

---

## Quick Reference: Flutter → Supabase Queries

```dart
// Fetch stores
final stores = await supabase.from('stores').select('*').eq('is_active', true);

// Fetch products by store
final products = await supabase
    .from('products')
    .select('*, product_images(*), product_variants(*)')
    .eq('store_id', storeId)
    .eq('status', 'active');

// Fetch categories (with subcategories via parent_id)
final categories = await supabase
    .from('categories')
    .select('*')
    .eq('is_active', true)
    .order('sort_order');

// Fetch user's orders
final orders = await supabase
    .from('orders')
    .select('*, order_items(*), stores(name, code)')
    .eq('user_id', userId)
    .order('placed_at', ascending: false);

// Fetch user's addresses
final addresses = await supabase
    .from('addresses')
    .select('*')
    .eq('user_id', userId);

// Create order
final order = await supabase.from('orders').insert({
  'user_id': userId,
  'status': 'pending',
  'subtotal': subtotal,
  'tax_amount': tax,
  'delivery_charge': charge,
  'total_amount': total,
  'payment_method': 'cod',
  'delivery_address_id': addressId,
  'delivery_date': '2026-07-26',
  'placed_at': DateTime.now().toUtc().toIso8601String(),
}).select().single();

// Insert order items
await supabase.from('order_items').insert([
  {
    'order_id': order['id'],
    'product_id': productId,
    'variant_id': variantId,
    'quantity': 2,
    'unit_price': 100,
    'total_price': 200,
    'gst_rate': 5,
    'gst_amount': 10,
    'status': 'pending',
  }
]);

// Decrement stock (RPC)
await supabase.rpc('decrement_stock', params: {
  'p_product_id': productId,
  'p_variant_id': variantId,
  'p_quantity': 2,
});

// Get delivery charge
final response = await http.post(
  Uri.parse('$baseUrl/api/delivery/charge'),
  body: jsonEncode({'latitude': lat, 'longitude': lng, 'storeId': storeId}),
  headers: {'Content-Type': 'application/json'},
);

// Create return request
await supabase.from('return_requests').insert({
  'order_id': orderId,
  'requested_by': userId,
  'source': 'customer',
  'reason': 'damaged',
  'customer_notes': 'Item was crushed during delivery',
});

await supabase.from('return_request_items').insert({
  'return_request_id': returnRequestId,
  'order_item_id': orderItemId,
  'quantity': 1,
});

// Create support ticket
await supabase.from('support_tickets').insert({
  'user_id': userId,
  'subject': 'Order not delivered',
  'message': 'My order was marked delivered but I did not receive it',
  'status': 'open',
  'priority': 'high',
});

// Fetch reviews for a product
final reviews = await supabase
    .from('product_reviews')
    .select('*, profiles(full_name)')
    .eq('product_id', productId)
    .order('created_at', ascending: false);

// Fetch wishlist
final wishlist = await supabase
    .from('wishlists')
    .select('*, products(*)')
    .eq('user_id', userId);

// Fetch banners
final banners = await supabase
    .from('banners')
    .select('*')
    .eq('is_active', true)
    .order('position');
```
