# Hyperlocal Backend — Knowledge Graph Report

## Overview
Next.js 16 (Turbopack) superadmin panel for the Hyperlocal grocery delivery platform. 55 source files, 157 graph nodes across 29 communities.

## Architecture

### Route Groups & Data Flow
```
Root Layout → StoreProvider (Redux) → BootstrapClient → {children}
  ├─ /auth/login          → signIn/signOut server actions
  └─ (admin)/layout       → auth guard → MasterLayout (sidebar + topbar)
       ├─ /dashboard      → Stats RPC + ApexCharts area chart
       ├─ /categories     → Modal CRUD (useActionState)
       ├─ /products       → Full-page form + VariantEditor
       ├─ /orders         → List + detail with status modals + timeline
       ├─ /invoices       → List + detail with @react-pdf/renderer PDF
       ├─ /banners        → Modal CRUD with drag-to-reorder
       └─ 9 placeholder pages
```

### Supabase Client Stack
| Client | File | Key | Purpose |
|--------|------|-----|---------|
| Server SSR | `server.ts` | anon key + cookies | Auth checks, getUser() |
| Browser | `client.ts` | anon key + cookies | Client-side auth |
| Admin | `admin.ts` | service_role | All data CRUD, bypasses RLS |
| Middleware | `middleware.ts` | anon key | Session refresh on every request |

## Communities (29 total)

### Core Communities
- **Community 0-2**: Dashboard + DashboardClient (stats, charts, low stock)
- **Community 3-5**: Categories CRUD (page → client → form → actions)
- **Community 6-9**: Products CRUD (page → client → form → variant editor → actions)
- **Community 10-13**: Orders CRUD (page → client → detail → actions)
- **Community 14-16**: Invoices CRUD (page → client → detail → PDF → actions)
- **Community 17-18**: Banners CRUD (page → client → form → actions)
- **Community 20-28**: Placeholder pages (8 routes using PlaceholderPage component)

### Infrastructure Communities
- **Community 19**: Auth system (login page, signIn/signOut, middleware)
- **Community 29**: Supabase lib clients (server, client, admin, middleware)
- **Community 30**: Redux infra (store, hooks, baseApi)
- **Community 31**: Types (15 database model types)
- **Community 32**: Layout/MasterLayout/BootstrapClient

## Database Schema
Connected to Supabase project `xjmngvxbaxlutupqavdr` (shared with Hyperlocal-App frontend).
Key tables: products (330), product_variants (182), categories, orders, order_items, order_tracks, invoices, banners, profiles, addresses, stores, brands, deals.

## Key Files
| File | Path | Role |
|------|------|------|
| Admin client | `src/lib/supabase/admin.ts` | Service-role Supabase client |
| Types | `src/lib/types/supabase.ts` | 15 shared DB model types |
| Dashboard | `src/app/(admin)/dashboard/` | Stats, charts, low stock alerts |
| Categories | `src/app/(admin)/categories/` | Modal CRUD with useActionState |
| Products | `src/app/(admin)/products/` | Full-page form + inline variants |
| Orders | `src/app/(admin)/orders/` | List + detail with status/payment modals |
| Invoices | `src/app/(admin)/invoices/` | List + detail + @react-pdf/renderer PDF |
| Banners | `src/app/(admin)/banners/` | Modal CRUD with position reorder |

## Status
- ✅ Auth (email/password login, middleware, signOut)
- ✅ Dashboard (stats, monthly chart, low stock alerts)
- ✅ Categories CRUD (modal form with parent/featured/sort)
- ✅ Products CRUD (full form with variants, prices, GST)
- ✅ Orders CRUD (list, detail, status update, timeline, payment)
- ✅ Invoices (list, detail, PDF generation)
- ✅ Banners CRUD (reorderable, image preview)
- ⏳ Customers, Users, Roles, Notifications, Settings, Delivery zones/slots, GST numbers, Inventory log (placeholders)
