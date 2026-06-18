# Backend Testing Report — Hyperlocal Admin

> Generated: 2026-06-18 · Test infrastructure: Vitest 4.1.9 + chainable Supabase mocks · CI: GitHub Actions

## Status Snapshot

| Metric | Current | Target |
|---|---|---|
| Test files | **35** | 30+ |
| Tests passing | **626 / 626** | 250+ |
| Typecheck | clean | clean |
| Lint errors | **0** | 0 |
| Lint warnings | 50 | trend → 0 |
| Build | passing | passing |
| Coverage thresholds | defined (70/60/70/70) | enforced |
| CI workflow | configured | enabled on push/PR |

## Phased Plan

| Phase | Scope | Status | Tests added |
|---|---|---|---|
| **P1** Foundation | Vitest install, config, mock infra, factories, helpers, CI | **DONE** | 17 |
| **P2** Core lib | `permissions`, `require-permission`, `store-scope`, 4× `supabase/*`, `auth/actions`, `middleware` | **DONE** | +69 |
| **P3** Money-critical | `orders`, `invoices`, `commissions`, `products` (+ bulk import), `stores` (+ locked categories), `settings` (3 keys) | **DONE** | **+158** |
| **P4** Identity & access | `users`, `roles`, `staff`, `customers` | **DONE** | **+112** |
| **P5** Catalog & content | `categories`, `banners`, `media` | **DONE** | **+62** |
| **P6** Operations | `delivery-zones`, `delivery-slots`, `gst-numbers`, `notifications`, `inventory-log` | **DONE** | **+89** |
| **P7** Reports & dashboard | `reports` (8 aggregators), `dashboard` (refactored to actions.ts) | **DONE** | **+49** |
| **P8** Component smoke | `MasterLayout` (admin shell), `PlaceholderPage` (empty-state) | **DONE** | **+45** |
| **P9** Polish | `ImagePickerModal` test, lint cleanup, AGENTS.md, coverage report | **DONE** | **+15** |
| **P10** Bug fix | Product edit/new page scope bugs + 10 page tests | **DONE** | **+10** |

## P1 — Foundation (DONE)

### Files created (13)

| File | Purpose |
|---|---|
| `vitest.config.ts` | Vitest config — `@/*` alias, `node` env, coverage thresholds |
| `test/setup.ts` | env-var placeholders, mock reset between tests |
| `test/mocks/supabase.ts` | Chainable query builder mock (19 chainable methods, `single`/`maybeSingle`/`then` terminals, response queue, `auth.*` + `storage.*` + `rpc`, call recorder with `chainsForTable()`) |
| `test/mocks/supabase-clients.ts` | Side-effect mock of `@/lib/supabase/{admin,server,middleware}`; singleton admin/server handles; `setServerUser()` queues user before `createClient()`; server proxy exposes full `auth` interface (getUser/signInWithPassword/signOut/signUp) |
| `test/mocks/require-permission.ts` | Side-effect mock of `@/lib/require-permission`; `asSuperAdmin()` / `asAdmin(perms)` / `asAnonymous()` |
| `test/mocks/next-cache.ts` | `revalidatePath` + `revalidateTag` as `vi.fn()` |
| `test/mocks/next-navigation.ts` | `redirect` throws `NEXT_REDIRECT:<url>` sentinel; `notFound` throws `NEXT_NOT_FOUND` |
| `test/fixtures/factories.ts` | 18 entity factories |
| `test/fixtures/formdata.ts` | `buildFormData()` boolean→`on`/`off` coercion; `buildFormDataWithFiles()` for multipart |
| `test/helpers/invoke-action.ts` | `runAction()` catches `NEXT_REDIRECT`, returns `{ ok, redirectedTo, error, value }` |
| `test/helpers/auth.ts` | Re-exports of `asSuperAdmin`/`asAdmin`/`asAnonymous` |
| `test/__tests__/p1-smoke.test.ts` | 17 smoke tests |
| `.github/workflows/test.yml` | CI: install → lint → typecheck → test → build |

## P2 — Core lib (DONE)

| File | Tests | Coverage |
|---|---|---|
| `src/lib/permissions.test.ts` | 17 | `PERMISSION_MODULES` shape, `hasPermission`, `canAccess` |
| `src/lib/require-permission.test.ts` | 14 | `requirePermission` redirect paths, `assertPermission` throw paths, `getActionPermissions` |
| `src/lib/store-scope.test.ts` | 8 | `getStoreScope` role/Super-Admin scenarios, `withStoreScope` |
| `src/lib/supabase/admin.test.ts` | 5 | env validation, fresh client per call |
| `src/lib/supabase/server.test.ts` | 4 | cookie read/write propagation |
| `src/lib/supabase/client.test.ts` | 2 | browser client |
| `src/lib/supabase/middleware.test.ts` | 4 | `updateSession` redirect/passthrough |
| `src/app/auth/actions.test.ts` | 9 | `signIn` 5 error paths + success, `signOut` revalidate+redirect |
| `middleware.test.ts` | 6 | `next-action` bypass, delegation, matcher shape |

## P3 — Money-critical (DONE)

| File | Tests | Coverage |
|---|---|---|
| `src/app/(admin)/orders/actions.test.ts` | 26 | `getOrders`/`getOrder` w/ filters, `updateOrderStatus` auto-sets `confirmed_at`/`delivered_at`, inserts `order_tracks` row, `updatePaymentStatus` 4 statuses, `deleteOrder` cascades `order_tracks`/`order_items`/`invoices` |
| `src/app/(admin)/invoices/actions.test.ts` | 17 | `getInvoices`/`getInvoice`, `generateInvoice` number format `INV-YYYY-NNNN`, taxable = total − delivery_charge, CGST = SGST = gstTotal/2, sets `orders.invoice_id`, revalidates both paths |
| `src/app/(admin)/commissions/actions.test.ts` | 34 | `getStoresLight`, `getCommissions` w/ payment counts + store filter, `getCommissionPayments`, `generateCommission` math (total × rate/100), "unpaid" vs "paid" status, notes, `recordPayment` validation (NaN, ≤0, > balance), state transitions to "paid" or "partially_paid", `deleteCommissionPayment` reverse math + status band logic |
| `src/app/(admin)/products/actions.test.ts` | 25 | `createProduct` slug, store fallback, variants/images JSON, malformed JSON, `updateProduct` deletes-then-inserts variants+images, `deleteProduct` cascades, **`bulkImportProducts`** valid rows imported, missing name error, unknown category → null, mixed success/failure summary, default values, case-insensitive category lookup, revalidation |
| `src/app/(admin)/stores/actions.test.ts` | 30 | `getStores`/`getStoreRelations`, `deleteStore` is_active guard + 90-day cooldown, `getStoreCategories`, `getLockedStoreCategories` classifies as `products` / `orders` / `both`, active-order status filter, `assertCategoriesRemovable` aggregates product+order counts in error, `setStoreCategories` removes/inserts, `getEligibleManagers` filters Super Admin |
| `src/app/(admin)/settings/actions.test.ts` | 26 | `getStoreSettings` first-store fallback, `DEFAULT_POLICIES`/`DEFAULT_PAYMENT`/`DEFAULT_GST` fallbacks, merged saved settings, `updateStore` scalar + categories + locked-check, `createStore` name+slug validation, owner update, `updateStoreSetting` per-key insert/update + `group_name` mapping, unknown key throws |

### P3 findings & decisions

- **Promise.all with mixed chains + async functions**: microtask ordering means async-resolving inputs (e.g. `fetchZones()`, `fetchGst()` inside `getStoreSettings`) consume their responses BEFORE the sync chains. Tests in `getStoreSettings` must enqueue responses in the actual consumption order (zones, gst, settings, slots — not the array order). Documented inline in the test.
- **Source bugs surfaced (not fixed — out of P3 scope)**:
  - `createProduct` declares `productSlug` but never inserts it into the products row. Test asserts the slug is **absent** from the insert to lock in current behavior.
  - `redirectMock` in `next-navigation` throws `NEXT_REDIRECT:<url>`. The `runAction` helper catches this and returns `{ ok: false, redirectedTo }`. Tests that expected `await expect(...).rejects.toThrow(...)` were wrong — they assert `result.error.message` instead.
- **Mock refinements during P3**: the `auth.signInWithPassword` / `auth.signOut` path now works because the server proxy passes through all auth methods (P1 fix) and `auth.getUser` is intercepted by the proxy before the chainable queue.

## P4 — Identity & access (DONE)

| File | Tests | Coverage |
|---|---|---|
| `src/app/(admin)/users/actions.test.ts` | 45 | `getRoles`/`getStoresLight` ordering + null/error paths, `getUsers` Staff-role `neq` filter (present/absent), role string filter (admin/customer/superadmin) vs numeric `role_id` filter, `'all'`/undefined → no extra `eq`, order count + role-name + store-name enrichment, `is_active` null default; `updateUserRole` demote-to-customer (role_id=null, role='customer'), superadmin promotion (role name match), admin fallback; `toggleUserActive` flip; `deleteUser` profile delete; `updateUser` trim/empty → null, email omitted when empty, error throws; `createUser` email/password/role_id required, `auth.admin.createUser` (email_confirm=true, user_metadata), role sync (Super Admin → superadmin, else admin, fallback admin), store_id omitted when empty, profile insert error → rollback via `auth.admin.deleteUser` |
| `src/app/(admin)/roles/actions.test.ts` | 23 | `getRoles` (roles module) userCount aggregation (string role_id coerced to Number), error/null/empty paths; `createRole` permissions JSON parse + invalid JSON fallback + missing field fallback, null description, error throw; `updateRole` patch semantics; `deleteRole` head:true count check against `profiles`, refuses with `Cannot delete role with N assigned user(s)` message, null count → proceed, delete error throws, revalidates `/roles` |
| `src/app/(admin)/staff/actions.test.ts` | 31 | `getStoresLight`; `getStaff` requires `staff:view`, returns [] when Staff role missing, role_id eq + optional store_id eq, order by created_at desc, is_active null default, error paths, store enrichment skipped when no store_ids; `createStaff` name required, Staff role existence, role_id+role=admin+is_active=true insert, null phone/staff_type/store_id; `updateStaff` full_name only-if-truthy, phone/staff_type always, store_id only-if-truthy; `toggleStaffActive`; `deleteStaff` |
| `src/app/(admin)/customers/actions.test.ts` | 13 | `getCustomers` (no storeId) auth.listUsers → profiles with role=customer → address count → order count; filters out users with no customer profile; aggregations of addressCount/orderCount; (with storeId) probe orders.user_id scoped by store, deduplicates user_ids, early-return [] when no orders; order count chain ALSO has `eq store_id` when storeId; auth.admin.listUsers called internally to enrich email/phone/created_at/last_sign_in_at; filters out user_ids with no customer profile |

### P4 findings & decisions

- **`getUsers` filter branch logic**: source applies `neq("role_id", staffRole.id)` only when Staff role lookup returns a row. Test locks in BOTH branches — present (filter chain has 2 `neq`s) vs absent (1 `neq`).
- **Role filter dispatch in `getUsers`**: `customer`/`admin`/`superadmin` → `eq("role", ...)`, anything else that parses as a number → `eq("role_id", n)`, `'all'` and undefined → no `eq`. Tested across all 6 cases.
- **`updateUserRole` dual role_id handling**: when `role_id === "customer"` it nullifies role_id and sets role="customer" without a role lookup. Otherwise it looks up role.name and picks "superadmin" iff name === "Super Admin", else "admin". null role name also falls back to "admin".
- **`createUser` auth + profile atomicity**: `auth.admin.createUser` (mock) and `profiles.insert` happen sequentially. On profile insert error, the source calls `auth.admin.deleteUser(authUser.user.id)` to roll back. Test asserts both the thrown error and the delete call.
- **Email-omission in `updateUser`**: source omits the `email` key from the update object when the input is empty (only sets it if truthy). Other fields always set (to null when empty). Test asserts the absence of the key.
- **`getRoles` (roles module) count coercion**: source does `Number(row.role_id)` before mapping, so the count works even if the DB returns stringified ids. Test locks in this coercion.
- **`deleteRole` count query is on `profiles`, not `roles`**: easy to misread the source. Test asserts the count chain is `profiles` with `head: true, count: "exact"` and `eq("role_id", id)`; the actual delete is a separate `roles` chain.
- **`createStaff` always sets `role: "admin"`**: even though the role_id is Staff, the `role` string column gets "admin" (presumably for backward compat with `neq("role", "customer")` filtering). Test asserts both fields.
- **`updateStaff` write-on-truthy pattern**: `full_name` and `store_id` are only set when truthy; `phone` and `staff_type` are always set (null when empty). Test asserts each case.
- **`getStaff` missing `staff:view`**: throws `PermissionError` immediately (not redirected) — `assertPermission` is used, not `requirePermission`. Test asserts throw, not redirect.
- **`getCustomers` no-storeId path does NOT call orders probe**: the `if (storeId)` branch handles user-derivation differently. Without storeId, `auth.admin.listUsers` provides userIds directly; with storeId, orders.user_id (filtered by store) provides userIds (deduplicated via Set). Test asserts this divergence in chain counts.
- **Source bugs surfaced (not fixed — out of P4 scope)**:
  - `getCustomers` (no storeId) does not re-fetch user records via `auth.admin.listUsers` after the initial call — it reuses the same `users` array via a second implicit listUsers call. If the source's intent was to call `listUsers` twice and the calls return different data, the test would expose a race. (Test confirms only ONE `auth.admin.listUsers` call is made in the storeId path; the no-storeId path also makes one call.)
  - `getStaff` `store_name` enrichment happens via a separate `stores` chain, but the `chainsForTable("stores")` lookup is vulnerable to false positives if any other test or source builds a `stores` chain (e.g. P3 stores test). The `resetSupabaseClients` between tests prevents this.

## P5 — Catalog & content (DONE)

| File | Tests | Coverage |
|---|---|---|
| `src/app/(admin)/categories/actions.test.ts` | 16 | `createCategory` slug derivation (lowercase, dash-separated, strip non-alphanumerics), null-coercion of description/image_url/parent_id, `is_featured` checkbox semantics (`"on"`=true, absent=false), `is_active` semantics (`!== "off"`=true, `"off"`=false), sort_order default 0, throws on insert error, revalidates + redirects to `/categories`; `updateCategory` same shape + `eq("id", id)`, throws on update error; `deleteCategory` 2-step (orphan children via `update parent_id=null, eq parent_id=id` THEN `delete .eq id=id`), NO redirect after delete (only revalidate), throws on delete error |
| `src/app/(admin)/banners/actions.test.ts` | 25 | `getBanners` order by position asc, optional `eq store_id` (applied when storeId, NOT when null/undefined), throws on error, [] on null data; `createBanner` name required, both `"on"` and `"true"` coerce `is_active` to true, `"off"`/absent to false, default position 0, throws on insert error, revalidates `/banners`; `updateBanner` same shape, `eq("id", id)`, throws on update error; `deleteBanner` `delete .eq id=id`, throws on delete error; `reorderBanners` per-item update in a for loop (N chains for N items), **aborts on first error** (verified only 2 chains for 3 items when 2nd errors), empty items array just revalidates |
| `src/app/(admin)/media/actions.test.ts` | 21 | `listMedia` `ensureBucket` (creates `product-images` with `public:true, fileSizeLimit:5242880, allowedMimeTypes:[png,jpeg,webp]` when missing, skips when present), `storage.list("", { sortBy: { column: "updated_at", order: "desc" }})`, publicUrl composition (baseUrl trailing slash stripped), updated_at default `""` and size default 0; `uploadMedia` no-files error, unique filename pattern `\d+-[a-z0-9]{6}.{ext}`, mime map (png/jpg/jpeg/webp), falls back to `file.type` for unknown ext, falls back to `image/jpeg` for both unknown ext and empty `file.type`, multi-file uploads have distinct names, creates bucket if missing, revalidates `/media`; `deleteMedia` `storage.remove([fileName])`, no `ensureBucket` call (faster path), revalidates `/media` |

### P5 findings & decisions

- **`createCategory` and `updateCategory` use `redirect()`** which the mock's `next-navigation` translates to a `NEXT_REDIRECT:<url>` sentinel. The `runAction` helper catches this. Tests assert `result.redirectedTo === "/categories"`.
- **`deleteCategory` does NOT redirect** (unlike create/update). It only revalidates. Test asserts `redirectMock` is NOT called.
- **`deleteCategory` is a 2-step on the same table**: first UPDATE children (`parent_id → null`) with `eq("parent_id", id)`, then DELETE the row with `eq("id", id)`. The mock's `chainsForTable("categories")` returns both chains in order. If the second step fails, the orphan-update has already executed — no transaction is enforced.
- **`createBanner.is_active` semantics differ from `createCategory.is_active`**: banners uses `=== "on" || === "true"` (positive list), categories uses `!== "off"` (negative list). Both default to `true` when the field is absent.
- **`reorderBanners` aborts on first error**: the for-loop calls `await` for each item, so an error in item 2 prevents item 3 from being issued. Test asserts the `chainsForTable("banners")` count is exactly 2 for a 3-item list with the 2nd failing. This required switching from `setResponses` (replaces queue) to `enqueueResponse` (appends) so the success response for item 1 is preserved.
- **`media` actions re-fetch `getPublicUrl("")` to compose the baseUrl**: a code smell — could be a constant. Test locks in current behavior: URL = `${NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/${fileName}` (trailing slash of empty-path call is stripped).
- **Media error paths unreachable in current mock**: the mock's `storage.from(bucket).list` and `remove` always return `{ data, error: null }`. The source's `if (error) console.error(...); return [];` and `if (error) throw new Error(error.message);` branches are documented as untestable without extending the mock. P5 tests assert the happy paths and skip the error branches.
- **`uploadMedia` filename `?? "jpg"` is dead code**: `file.name.split(".").pop()` is always defined (split always returns ≥1 element), so the nullish-coalesce never fires. For a file named "noext", the extension becomes "noext" and the filename ends in `.noext`. Test locks in this current behavior.
- **Source bugs surfaced (not fixed — out of P5 scope)**:
  - `deleteCategory` is not transactional — orphan-update and delete are two separate `await` calls. If the delete fails after orphan-update succeeds, children are now root categories with no record of why. A test verifies both calls happen in order.
  - `uploadMedia` `ext ?? "jpg"` fallback is unreachable; an untyped file always produces a 6-char base36 filename with the (possibly full) "extension" appended. Could mask bugs at the call site.
  - `deleteMedia` does NOT call `ensureBucket` — if the bucket was deleted out-of-band, the `remove` call would still be issued against a non-existent bucket. The mock passes silently; the real API would 404.

## P6 — Operations (DONE)

| File | Tests | Coverage |
|---|---|---|
| `src/app/(admin)/delivery-zones/actions.test.ts` | 22 | `getDeliveryZones` order by name asc, optional `eq store_id` (applied for string, NOT for null); null-data → []; throws on error. `createDeliveryZone` name+store_id required, pincodes parsing (comma-split, trim, filter empty), default pincodes=[], is_active/is_express both `"on"` or `"true"` → true, default numeric fields to 0, throws on insert error, revalidates `/delivery-zones`. `updateDeliveryZone` same shape but does NOT require store_id, updates by id, throws on update error. `deleteDeliveryZone` permission + delete by id + revalidate + throws on error |
| `src/app/(admin)/delivery-slots/actions.test.ts` | 24 | `getDeliverySlots` `select("*, delivery_zones!inner(store_id)")` (PostgREST inner join syntax), order by start_time asc, `eq("delivery_zones.store_id", storeId)` (foreign-key filter path), null-data → []. `createDeliverySlot` name+zone_id+start_time+end_time all required, available_days parsing (comma-split, parseInt, NaN filtered), default [], capacity default 0, is_active semantics; throws on insert error. `updateDeliverySlot` only name required (NOT zone_id/start_time/end_time — they're empty strings on update), updates by id. `deleteDeliverySlot` |
| `src/app/(admin)/gst-numbers/actions.test.ts` | 23 | `getGstNumbers` `select("*, stores(name)")` order by created_at desc, `eq store_id`, null-data → []. `createGstNumber` gstin+store_id required, is_primary/is_active semantics, default numerics to 0, **NO state_code validation** (any string accepted), **NO is_primary uniqueness guard** (multiple primaries allowed). `updateGstNumber` only gstin required, does NOT require store_id. `deleteGstNumber` |
| `src/app/(admin)/notifications/actions.test.ts` | 13 | `getNotifications` `select("*, profiles(full_name, email)")` order by created_at desc. `createNotification` title+user_id required, type is free-form string (no enum), does NOT auto-set is_read/read_at/created_at (relies on DB defaults), throws on insert error, revalidates `/notifications`. `deleteNotification` permission + delete by id. **NOTE: source uses `assertPermission("notifications", "create")` but PERMISSION_MODULES has only ["view", "send", "delete"] — production will always reject non-super-admin creates** |
| `src/app/(admin)/inventory-log/actions.test.ts` | 7 | Read-only. `getInventoryLogs` `select("*, products!inner(name, store_id), product_variants(name)")` (PostgREST inner join), order by created_at desc, `eq("products.store_id", storeId)`, **no `assertPermission` call** (locks in absence), null-data → [], throws on error |

### P6 findings & decisions

- **PostgREST foreign-key filter syntax**: `eq("delivery_zones.store_id", storeId)` and `eq("products.store_id", storeId)` are not standard `eq` calls — they rely on PostgREST's embedded-resource filtering. The mock records these as ordinary `eq` calls; the syntax is invisible to the chain builder. Tests assert the exact `eq` arguments to lock in the path.
- **`createDeliveryZone` requires both name and store_id**; `updateDeliveryZone` only requires name (store_id can be empty on update — the empty string is passed through to the DB).
- **`createDeliverySlot` requires name+zone_id+start_time+end_time**; `updateDeliverySlot` only requires name — the others become empty strings on update. Could be a bug (a user could accidentally clear times by updating), but currently expected.
- **available_days parser is permissive**: `parseInt("foo", 10)` returns NaN, filtered by `.filter((n) => !isNaN(n))`. `"1,foo,2"` → `[1, 2]`. Locked in by test.
- **`createGstNumber` has NO state_code validation**: `"INVALID"` is accepted and passed to the DB. The DB column presumably has its own constraint (2-digit format) but the action layer doesn't pre-validate.
- **`createGstNumber` has NO is_primary guard**: two GST numbers with `is_primary=true` for the same store are both inserted. If the DB has a unique partial index on `(store_id, is_primary=true)`, the second insert would fail with a constraint error; if not, both would coexist and downstream code picking "the primary" would be non-deterministic.
- **`createNotification` permission action mismatch (SOURCE BUG)**: source uses `assertPermission("notifications", "create")` but `PERMISSION_MODULES.notifications = ["view", "send", "delete"]`. In production, this means a non-super-admin user CANNOT create notifications. The mock passes our tests because we grant the role the literal `"create"` action string in the permission object. To fix, change the source to `assertPermission("notifications", "send")` (and the role-permissions UI to use "send" for notifications).
- **`getInventoryLogs` has NO `assertPermission` call**: anyone with access to the action can read it. The module entry in `PERMISSION_MODULES` is `inventory_log: ["view"]` (view-only), so a permission gate would be redundant. Test asserts `assertPermissionMock` is NEVER called, locking in the read-only design.
- **`createNotification` does NOT auto-set server-side defaults**: no `is_read=false`, no `read_at=null`, no `created_at=now()`. Relies entirely on the DB column defaults. If the DB columns don't have defaults, inserts will succeed with `null` for those fields. Test asserts the insert payload has only the 4 fields the source explicitly sets.
- **`createNotification` accepts any `type` string**: no enum validation. `"totally-custom-type"` is accepted. Could be intentional (extensibility) or a bug (typos accepted).
- **Source bugs surfaced (not fixed — out of P6 scope)**:
  - `createNotification` uses `assertPermission("notifications", "create")` but `create` is not a valid action for `notifications` module. Production-blocking for non-super-admins.
  - `createGstNumber` allows multiple `is_primary=true` records per store.
  - `createGstNumber` does not validate `state_code` format (no 2-digit check).
  - `updateDeliverySlot` allows clearing `start_time`/`end_time` to empty strings — could create invalid slot definitions.

## P7 — Reports & dashboard (DONE)

| File | Tests | Coverage |
|---|---|---|
| `src/app/(admin)/reports/actions.test.ts` | 36 | `getRevenueSummary` sum/count/avg of paid orders, today revenue (always `gte placed_at today`), `avgOrderValue = 0` when count=0 (not NaN), date range filter via gte/lte (with `${end}T23:59:59.999Z` extension), storeId filter on both chains, always `eq payment_status=paid`. `getRevenueByStore` group-by-store aggregation, sorted desc, "unknown" store_id bucket, NO storeId param. `getRevenueByMethod` group-by-method with label map (cod→"Cash on Delivery", upi→"UPI", etc.), falls back to raw key, "unknown" bucket. `getMonthlyRevenue` group-by `YYYY-MM` (zero-padded), sorted asc. `getGSTSummary` sum taxable+cgst+sgst, `orders!inner(store_id)` join, `invoice_date` column (not `placed_at`), missing cgst/sgst → 0. `getGSTMonthly` group-by-month, sorted asc. `getGSTByHSN` group-by `hsn_rate`, "NA" for null hsn, sorted desc. `getGSTByStore` group-by-store, no storeId param |
| `src/app/(admin)/dashboard/actions.test.ts` | 13 | `getDashboardStats` (refactored from inline in `page.tsx` to `actions.ts`): 10-chain `Promise.all` (8 pre-built + 1 inline profiles count + 1 monthly), all counts default to 0 on null, `status='active'` product filter with `head: true, count: 'exact'`, low-stock `lt stock_quantity 10` + order asc + limit 5, recent orders `order by placed_at desc + limit 5`, status breakdown via `.not("status", "is", null)` aggregating to `Record<string, number>`, storeId filter applies `eq store_id` to all 8 base chains (verified via call count: 9 total `eq store_id` calls = 8 base + 1 monthly), monthly via `rpc("get_monthly_order_stats")` when no storeId, inline `gte placed_at` 12-month query when storeId, `toLocaleString` aggregation |

### P7 findings & decisions

- **Refactor: extracted `getStats` from `dashboard/page.tsx` to `dashboard/actions.ts`** (called `getDashboardStats`). The original was a private function in a server component, untestable in isolation. Extraction is mechanical — page.tsx is now 4 lines + the import. No behavior change.
- **Date-range `lte` uses ISO with end-of-day suffix**: `lte("placed_at", `${end}T23:59:59.999Z`)`. The `end` parameter is treated as a date (e.g. `"2025-12-31"`), and the source extends it to the last millisecond of that day. Test asserts this exact string format.
- **`getGSTSummary` and `getGSTMonthly` use `invoice_date` for filtering, NOT `placed_at`**: when a date range is passed, the source uses the `dateFilter` helper's default `column = "placed_at"` argument UNLESS overridden. Both `getGSTSummary` and `getGSTMonthly` pass `"invoice_date"` as the 4th arg. Test asserts the exact column name in the `gte`/`lte` calls.
- **`getGSTSummary` applies `storeFilter(q, storeId)` which uses `eq("store_id", storeId)`** — but the query joins `orders!inner(store_id)`. The mock records the eq as-is; real PostgREST would need a different syntax for an embedded filter. This is a subtle bug — the source code doesn't realize `eq store_id` won't actually work for the joined invoice query. Test locks in current behavior; flagged as a likely production bug.
- **`getGSTByHSN` groups by `${hsn}_${rate}` composite key**: ensures products with same HSN but different GST rates are in separate groups. Locked in by test.
- **`getRevenueByMethod` label map**: `cod→"Cash on Delivery"`, `upi→"UPI"`, `wallet→"Wallet"`, `netbanking→"Net Banking"`, `card→"Card"`, `pay_at_pickup→"Pay at Pickup"`. Null method → `"Unknown"`. Unknown method keys pass through as raw.
- **Mock chainsForTable limitation discovered**: when the source interleaves `.eq` calls on different builders in a sequence (like the dashboard's if block), the 8 `eq("store_id", ...)` calls all get grouped with the LAST `from(table)` chain (lowStockQ) in `chainsForTable("products")`, because the mock's chain-grouping logic walks the call list and groups by `from(table)` boundaries. The actual builder closures have the eq on the correct chains, but the call-list walk merges them.
  - **Workaround**: count total `eq` calls in `admin.calls` filtered by args, rather than asserting per-chain presence.
  - **Mock fix candidate**: track which builder each call belongs to (use the builder's `_chain` array reference) and re-attribute during `chainsForTable`. Out of scope for P7.
- **Dashboard `Promise.all` consumes 9 responses synchronously, then 1 more (monthly)**: 8 pre-built chains + 1 inline `profiles` count + 1 monthly (rpc or orders) = 10 total. Test enqueues 10 responses in the right order.
- **`getDashboardStats` has no `assertPermission` call** — by design, anyone with access to the dashboard page can call it. Permission is enforced at the page level via `requirePermission` in the layout.
- **Source bugs surfaced (not fixed — out of P7 scope)**:
  - `getGSTSummary` and `getGSTMonthly` apply `eq("store_id", ...)` to queries that join `orders!inner(store_id)`. The eq would not filter the right table in real PostgREST. Should use the foreign-key filter syntax: `eq("orders.store_id", storeId)`.
  - `getGSTByHSN` and `getGSTByStore` also pass `storeId` to `storeFilter` which uses the same non-functional `eq("store_id", ...)`. The storeId parameter is effectively a no-op for these aggregators.
  - `getDashboardStats` aggregates `statusBreakdown` as `Record<string, number>` instead of typed enum — a `status` value of `""` (empty string) would be bucketed as `""` rather than `"unknown"`. Test asserts only the explicit `null → "unknown"` mapping.

## P8 — Component smoke (DONE)

| File | Tests | Coverage |
|---|---|---|
| `src/components/PlaceholderPage.test.tsx` | 8 | `PlaceholderPage` renders the title in h5, "coming soon" message, rounded icon circle wrapper (64x64), flex column center classes, py-5 padding, XSS-safe HTML escaping for special chars in title |
| `src/components/MasterLayout.test.tsx` | 37 | "Hyperlocal" brand + "Admin Panel" subtitle; user full_name/email/avatar initial fallback chain; role label (defaults to "Admin"); ToastContainer; children render in main area. Top-level nav items render/hide based on `module:view` permission; super admin bypasses all permission checks. Group menus (Management, Catalog, Sales, Content, Configuration) render when ANY child has view permission; children with no view perm are filtered out. Store-scoped role hides 7 admin-only modules (stores, categories, banners, notifications, users, roles, settings) regardless of permission. Active link highlighting via `pathname.startsWith(href)`, but NOT for "#" placeholder hrefs. Default-expanded menus (Catalog, Sales) render children; others (Management, Content, Configuration) are collapsed by default |

### P8 findings & decisions

- **No `@testing-library/react` available** — used `react-dom/server`'s `renderToString` for SSR-style assertion of rendered HTML. Avoids the dependency and works for the static parts of the components. Trade-off: cannot test interactive behavior (onClick handlers, useState updates) — only initial render.
- **`// @vitest-environment jsdom` directive at the top of each test file** overrides the global `node` environment for those tests only. `react-dom/server` works in either environment, but jsdom is required if the component imports client-only modules.
- **Mocks for client-only dependencies**:
  - `next/navigation`: `usePathname` is mocked to return a configurable string (default `"/"`)
  - `next/link`: replaced with a plain `<a href=...>` that preserves className/style/onClick
  - `@iconify/react`: replaced with `<span data-icon=...>` (no SVG rendering, but queryable)
  - `react-toastify`: `ToastContainer` mocked to a `<div data-testid="toast-container" />`
- **`useState` works in SSR**: `MasterLayout` uses `useState` for `sidebarOpen`, `expandedMenus`, `userMenuOpen`. The initial state is rendered. `renderToString` only sees initial state — cannot test that `toggleMenu` adds a label to `expandedMenus`. Documented as a known limitation.
- **`isSuperAdmin` bypasses `moduleVisible` but NOT `isNotHidden`**: For groups like Management (item.module is undefined), `isNotHidden(undefined)` returns true (no module = not hidden). For top-level items like `stores` (item.module is "stores"), if `isStoreScoped` AND module is in `storeScopedHidden`, `isNotHidden` returns false. Super admin is only checked in `moduleVisible`, not in `isNotHidden`. **Source bug**: a store-scoped super admin still has Stores/Categories/Users/etc. hidden. Locked in by test (store-scoped role tests don't toggle `isSuperAdmin`).
- **Group menus ALWAYS render even with no visible children (SOURCE BUG)**: The filter is `isNotHidden(item.module) && (moduleVisible(item.module) || itemHasVisibleChildScoped(...))`. For items where `item.module` is undefined (like Management), `isNotHidden(undefined) = true` and `moduleVisible(undefined) = true`, so the first part of the OR is true regardless of children. The group label shows even when no children pass the visibility check. Test locks in this behavior and documents the bug.
- **Default-expanded menus**: `useState(["Catalog", "Sales"])` means Catalog and Sales children render by default. Management, Content, Configuration are collapsed — their children links are NOT in the initial DOM, even for super admin. Test asserts this.
- **`isActive("#")` returns false**: the active-link helper has `href !== "#" && pathname.startsWith(href)`. The "#" placeholder for group buttons always evaluates to false, so the group button itself is never highlighted. Test asserts this with `pathname = "/catalog"`.
- **`(user.full_name || user.email || "U")[0].toUpperCase()`**: avatar initial falls back through full_name → email → "U". All three branches tested.
- **Test uses string assertions, not DOM queries**: `html.toContain("Management")` works for finding text but is brittle for asserting structure. A more robust approach would use a DOM parser. For these smoke tests, string matching is sufficient and faster.
- **Source bugs surfaced (not fixed — out of P8 scope)**:
  - `MasterLayout` group menus always render even when no children have view permission (filter logic bug).
  - `isSuperAdmin` does not bypass `isNotHidden` — store-scoped super admins still see admin-only modules hidden. (Workaround: check both flags together or remove from `storeScopedHidden` for super admins.)
  - `MasterLayout` `userMenuOpen` starts as `false` and is only toggled onClick — cannot be tested in SSR. The sign-out dropdown is not in the initial DOM.

## P9 — Polish (DONE)

| File | Tests | Coverage |
|---|---|---|
| `src/components/ImagePickerModal.test.tsx` | 15 | `ImagePickerModal` initial render (loading state from useEffect-not-yet-run), `selectedUrls` prop drives initial picked count, footer counter "0 selected" / "Add Selected (0)" with correct count, CSS structure (fixed position, rgba backdrop, z-index 1050, width 720), card-header has close button, card-footer has Cancel + Add Selected, `listMedia` NOT called during SSR, `lastSelectedRef` guard regression (renders stably with same prop) |

### Coverage report (final)

```
File               | % Stmts | % Branch | % Funcs | % Lines
All files          |   93.37 |    85.99 |   92.53 |   94.27
```
- Per-module: every `actions.ts` file is 90%+ covered; lowest is `media/actions.ts` at 86% (uncovered: `console.error` branches from B18 mock gap).
- Uncovered source files: 3 API routes (`app/api/{migrate-wishlist,upload,auth/login/api}/route.ts`) at 0% (not in P1-P8 scope) and `lib/redux/**` (UI-only, server tests can't reach).
- Coverage thresholds (70/60/70/70) easily pass. No tuning needed.

### Lint cleanup

| Before P9 | After P9 |
|---|---|
| **15 errors**, 52 warnings | **0 errors**, 51 warnings |
| `npm run lint` exit code: 1 (CI red) | `npm run lint` exit code: 0 (CI green) |

**Errors fixed (15 total):**
| # | File:Line | Issue | Fix |
|---|---|---|---|
| 1-2 | `src/app/(admin)/products/ProductForm.tsx:332` | `react/no-unescaped-entities` (double quote) | Escaped as `&quot;` |
| 3 | `src/app/(admin)/users/UsersClient.tsx:526` | `react/no-unescaped-entities` (apostrophe) | Escaped as `&apos;` |
| 4-7 | `src/app/(admin)/reports/ReportsClient.tsx:94,100,104,110` | `no-explicit-any` (4× `as any[]`, `as any`) | Replaced with `Promise.resolve([] as Awaited<ReturnType<typeof getX>>)` to derive type from the function's return |
| 8-9 | `src/app/(admin)/reports/actions.ts:6,16` | `no-explicit-any` (parameter type in helpers) | Replaced duck-typed `QueryChain` with a **generic constraint** that infers from the call site: `function dateFilter<T extends { gte: (c, v) => T; lte: (c, v) => T }>(q: T, ...): T`. Preserves the full PostgrestFilterBuilder type while satisfying the lint rule. |
| 10-13 | `src/app/(admin)/reports/actions.ts:90,302,345,346` | `no-explicit-any` (4× `as any` for joined-row properties) | Replaced with narrow shape assertions: `(o.stores as { name?: string } \| null)?.name`. Type-safe and no `any`. |
| 14-15 | `graphify-out/generate_backend_graph.js:1,2` | `no-require-imports` (2 errors in generated file) | Excluded `graphify-out/**` from `globalIgnores` in `eslint.config.mjs` (generated, never shipped) |

**Coverage exclusion added:** `graphify-out/**` and `coverage/**` in `globalIgnores` (project-specific, not part of eslint-config-next defaults).

**Remaining 51 warnings (non-blocking, tracked but not fixed):**
- 39 `no-unused-vars` — mostly imports in test files (`asSuperAdmin`, `makeStore`, `vi`, etc.) and Client files (`Icon`, `Link`, `useRef`, `useMemo`). Low risk; trivially fixable with `_` prefix or import removal. Out of scope for P9.
- 11 `no-img-element` — use of `<img>` instead of Next.js `<Image />`. Performance recommendation, not a bug. Out of scope.
- 1 `react-hooks/exhaustive-deps` in `DashboardClient.tsx:72` — `useMemo` missing `statusColors` dep. Performance recommendation, not a bug. Out of scope.

### AGENTS.md updated

Added comprehensive "Testing" and "Lint" sections:
- Stack/run commands/layout
- Per-test imports pattern
- For component tests: `// @vitest-environment jsdom` directive
- Conventions: `setResponses` vs `enqueueResponse`, `runAction` for id-first functions, `as RolePermissions` casts, `<!-- -->` regex for React text
- Coverage thresholds + actual numbers
- Mock-incompleteness gotchas (storage error paths, `chainsForTable` grouping, no `PERMISSION_MODULES` validation)
- "Adding a new test file" checklist
- Lint: 0 errors required, graphify-out + coverage excluded, test files disable `no-explicit-any`

### P9 findings & decisions

- **`Promise.resolve([] as Awaited<ReturnType<typeof getX>>)` is the cleanest `any` escape hatch** when you need to provide a default empty array in a Promise.all but the function type isn't directly importable. Derives the type from the function's return — no `any`, fully type-checked. Used in `ReportsClient.tsx` for `getRevenueByStore` and `getGSTByStore` fallbacks.
- **Generic constraints beat duck-typed interfaces for type-safe helpers**: `function dateFilter<T extends { gte: ...; lte: ... }>(q: T, ...): T` is type-safe (each call site must satisfy the constraint) AND the return type preserves the full `PostgrestFilterBuilder<...>` type for chaining. Duck-typed `QueryChain` would have worked for runtime but failed TypeScript's structural check against the actual Postgrest type.
- **`as any` for joined-row properties** should be `as { prop?: T } | null` — same flexibility, no lint violation, no `any` keyword. Used in 4 places in `reports/actions.ts`.
- **Generated files** (`graphify-out/**`) should be excluded from lint via `globalIgnores`. They're not source code and were already explicitly noted as "generated build script, never shipped" in earlier reports.
- **ImagePickerModal tested via SSR** — the component uses `useEffect` to call `listMedia()`, but `renderToString` doesn't run effects, so the initial state (loading spinner) is testable. The `lastSelectedRef` guard (which prevents cascading renders when `selectedUrls` prop is the same reference) is tested implicitly by rendering with the same prop twice and asserting no change.
- **`BootstrapClient` skipped** — it's a 9-line no-op component that returns `null` with no imports. Testing it would only verify the file exists. Not worth a test file.
- **Coverage thresholds NOT tuned up** — actual coverage (93.37/85.99/92.53/94.27) is well above 70/60/70/70. Keeping the current thresholds gives headroom for future code that doesn't need 100% coverage (e.g. UI client components, error paths). Tightening would risk CI flakiness without clear benefit.
- **API route files at 0%** (`app/api/{migrate-wishlist,upload,auth/login/api}/route.ts`) — out of P9 scope. Could be added as a follow-up P10 if API coverage becomes a priority.
- **Source bugs from prior phases still unfixed** (22 in the consolidated table). P9 did NOT attempt to fix them — that work is deferred to a separate follow-up.

## High-Risk Lint Fixes Applied (alongside P1)

| # | File | Issue | Risk | Fix |
|---|---|---|---|---|
| 1 | `src/app/(admin)/media/MediaClient.tsx:25` | `refresh()` called before declaration → TDZ | HIGH | Hoisted `refresh` above `onDrop`, added to `useCallback` deps |
| 2 | `src/components/ImagePickerModal.tsx:19` | `setPicked` in `useEffect` → cascading renders | HIGH | `useRef` to track last seen array, only `setPicked` on reference change |
| 3 | `src/app/(admin)/dashboard/DashboardClient.tsx:72` | `useMemo(..., [statusLabels.join(",")])` complex dep | HIGH | Wrapped `statusLabels` in own `useMemo`; dep simplified to `[statusLabels]` |
| 4 | `src/app/(admin)/users/actions.ts:101` | `let roleNameMap` never reassigned | MEDIUM | `const` |
| 5 | `src/app/(admin)/users/actions.ts:113` | `let storeNameMap` never reassigned | MEDIUM | `const` |

### Remaining low-risk lint (NOT fixed yet)

| Category | Count | Examples | Risk |
|---|---|---|---|
| `@typescript-eslint/no-explicit-any` | 10 | `CustomersClient.tsx`, `OrderDetailClient.tsx`, `actions.ts` files | low — type safety, not runtime |
| `react/no-unescaped-entities` | 3 | `OrderDetailClient.tsx:332,526` | low — visual only |
| `no-require-imports` | 2 | `graphify-out/generate_backend_graph.js:1,2` | none — generated build script, never shipped |

## P10 — Bug fixes (DONE)

User-reported bug: "under edit product category dropdown is not visible and superadmin can't change category of the product". Root cause: the edit page filtered the category dropdown by the **product's** `store_id` instead of the **current user's** effective store scope.

### Files changed

| File | Change |
|---|---|
| `src/app/(admin)/products/[id]/page.tsx` | Use `getStoreScope()` to get user's effective scope; pass that to `getCategories()`. Added `requirePermission("products", "view")` page-level gate. Removed unused `redirect` import. Added `categories(name)` join to product select (so current category name is available for the fallback option). |
| `src/app/(admin)/products/new/page.tsx` | Use `getStoreScope()` to get user's effective scope. Added `requirePermission("products", "view")` page-level gate. Updated `getCategories()` helper to take a `storeId` parameter and filter by `store_categories` (matching the edit page's pattern). |
| `src/app/(admin)/products/ProductForm.tsx` | Added `categories?: { name: string } \| null` field to `Product` type. Added a fallback `<option>` in the category `<select>` that displays the product's current category with "Current: … (out of scope)" label if the category is not in the filtered list. |

### Tests added (10)

| File | Tests |
|---|---|
| `src/app/(admin)/products/[id]/page.test.tsx` | 6 — calls `requirePermission("products", "view")`; rejects anonymous; superadmin sees all active categories with no `store_categories` lookup; store-scoped user sees only their store's categories with `eq("store_id", user's_store)` on `store_categories` and `.in("id", [...])` on the categories fetch; uses **user's** scope, not product's; calls `notFound()` when product missing |
| `src/app/(admin)/products/new/page.test.tsx` | 4 — calls `requirePermission("products", "view")`; rejects anonymous; superadmin sees all active categories; store-scoped user sees only their store's categories |

### P10 findings & decisions

- **`getCategories` was duplicated** between the edit page and new page (different signatures, same intent). Unified them to take a `storeId?: string \| null` parameter and apply the `store_categories` filter. Both pages now share the same fetch pattern.
- **Mock `chainsForTable` limitation (B19) hit again**: the test for "store-scoped user sees filtered categories" expected `.in("id", ...)` in the categories chain, but the call happens AFTER the `store_categories` `from()` in the outer calls list, so it gets grouped with `store_categories`. Same workaround as P7: count `admin.calls.filter(c => c.method === "in")` and assert the args directly. This is now the second time the limitation has impacted test design; flagged again in P10.
- **Page-level `requirePermission` is the pattern, not the exception** — every other admin page (categories list, products list, banners, etc.) calls `requirePermission` at the top. The edit page was the only outlier. Adding it fixes a missing page-level gate.
- **No `requirePermission` was needed in `updateProduct` action** — the action already does `assertPermission("products", "edit")`. The page-level call is a defense-in-depth check.
- **`createProduct` still has a pre-existing store-assignment bug** (out of scope): it always sets `store_id = store?.id ?? null` where `store` is the FIRST active store, not the current user's. This was flagged in the original plan as Q2 and is NOT fixed here.
- **The fallback `<option>` for out-of-scope categories** prevents visual confusion: without it, a store-scoped admin editing a product whose category was assigned by a superadmin would see the dropdown reset to "Select category" with no visual indication. With the fallback, they see the current value and can choose to keep it or change it.

### Verification

| Step | Result |
|---|---|
| `npm run typecheck` | ✅ clean (exit 0) |
| `npm test` | ✅ 626/626 passing across 35 files (exit 0) |
| `npm run lint` | ✅ 0 errors, 50 warnings (exit 0) |
| `npm run build` | ✅ passing (exit 0) |
| `npm run test:coverage` | ✅ 93.37/85.99/92.53/94.27 (exit 0) |

Net change: +10 tests, +2 test files, 0 lint regressions, 1 fewer warning (unused `redirect` import removed).

## Source Bugs Surfaced (consolidated, not fixed)

Bugs discovered during testing across all phases. Each test locks in current behavior. Fixes are deferred to a separate follow-up.

### Production-blocking (1)

| # | File:Line | Bug | Fix |
|---|---|---|---|
| B1 | `src/app/(admin)/notifications/actions.ts:25` | `assertPermission("notifications", "create")` — but `PERMISSION_MODULES.notifications = ["view", "send", "delete"]`. The literal `"create"` is not in the action list, so the check throws `PermissionError` for every non-super-admin user. **Notifications cannot be created in production.** | Change source to `assertPermission("notifications", "send")`. Update role-permissions UI to use "send" for the notifications module. |

### Wrong SQL / data leakage (4)

| # | File:Line | Bug | Fix |
|---|---|---|---|
| B2 | `src/app/(admin)/reports/actions.ts:204-227` (`getGSTSummary`) | `storeFilter(q, storeId)` applies `eq("store_id", storeId)` to a query that joins `orders!inner(store_id)`. In real PostgREST, the eq would not filter the right table. The storeId parameter is effectively a no-op — store admins see all GST data, not their own. | Use foreign-key filter syntax: `eq("orders.store_id", storeId)`. |
| B3 | `src/app/(admin)/reports/actions.ts:237-271` (`getGSTMonthly`) | Same bug as B2. | Same fix. |
| B4 | `src/app/(admin)/reports/actions.ts:281-321` (`getGSTByHSN`) | Same bug. The `storeId` parameter is ignored. | Same fix. |
| B5 | `src/app/(admin)/reports/actions.ts:331-363` (`getGSTByStore`) | Same bug. | Same fix. |

### Data integrity (3)

| # | File:Line | Bug | Fix |
|---|---|---|---|
| B6 | `src/app/(admin)/gst-numbers/actions.ts:32-53` (`createGstNumber`) | No guard prevents multiple GST numbers with `is_primary=true` for the same store. Two "primary" GSTs can coexist; downstream "pick the primary" logic becomes non-deterministic. | Add a DB partial unique index on `(store_id) WHERE is_primary = true`, OR add a pre-update step that clears `is_primary` on existing rows for the store. |
| B7 | `src/app/(admin)/categories/actions.ts:77-91` (`deleteCategory`) | Non-transactional: orphan-update and delete are two separate `await` calls. If the delete fails after orphan-update succeeds, children become root categories with no record of why. | Wrap both operations in a Supabase RPC function that runs them in a single transaction. |
| B8 | `src/app/(admin)/staff/actions.ts:78-110` (`createStaff`) | Source sets `role: "admin"` even when `role_id` is the Staff role. This is intentional for backward compat with `neq("role", "customer")` filtering but is a source of confusion — a "Staff" user has `role="admin"` and `role_id=<StaffId>`. | Document explicitly. Consider adding a `role_staff` value to PERMISSION_MODULES. |

### Missing validation (4)

| # | File:Line | Bug | Fix |
|---|---|---|---|
| B9 | `src/app/(admin)/gst-numbers/actions.ts:32-53` (`createGstNumber`) | `state_code` accepts any string. The DB column may have a 2-digit check, but the action layer pre-validation is absent. "INVALID" or "abc" pass through. | Add regex validation: `if (!/^\d{2}$/.test(state_code)) throw new Error("Invalid state code")`. |
| B10 | `src/app/(admin)/delivery-slots/actions.ts:54-75` (`updateDeliverySlot`) | Only name is required on update. A user can accidentally clear `start_time`/`end_time` to empty strings by submitting the form, creating invalid slot definitions. | Add validation for start_time and end_time on update too, OR conditionally include them in the update payload (only if truthy). |
| B11 | `src/app/(admin)/notifications/actions.ts:24-39` (`createNotification`) | `type` accepts any free-form string (`"totally-custom-type"`). Could be intentional for extensibility, but allows typos that would later break filtering UI. | Add enum validation against a known list: `["order", "promo", "system"]`. |
| B12 | `src/app/(admin)/dashboard/actions.ts:36-111` (`getDashboardStats`) | `statusBreakdown` is `Record<string, number>` — a `status` value of `""` (empty string) would be bucketed as `""` rather than `"unknown"`. The current code only handles `null → "unknown"`. | Change `const s = o.status ?? "unknown";` to `const s = o.status?.trim() || "unknown";` (or similar). |

### Dead code (2)

| # | File:Line | Bug | Fix |
|---|---|---|---|
| B13 | `src/app/(admin)/products/actions.ts:56-60` (`createProduct`) | `productSlug` is computed via regex but never inserted into the products row. For a file named "Whole Wheat Bread!", the slug `whole-wheat-bread` is calculated and discarded. | Either add `slug: productSlug` to the insert payload, or remove the dead variable. |
| B14 | `src/app/(admin)/media/actions.ts:67` (`uploadMedia`) | `const ext = file.name.split(".").pop() ?? "jpg";` — the nullish-coalesce is unreachable because `String.prototype.split()` always returns ≥1 element. For a file named "noext" (no dot), the extension becomes the entire filename "noext" and the stored filename ends in `.noext`. | Remove `?? "jpg"`. Optionally, validate ext is in the mime map and throw if not. |

### UI / filter logic (3)

| # | File:Line | Bug | Fix |
|---|---|---|---|
| B15 | `src/components/MasterLayout.tsx:135-140` | Group menus (Management, Content, Configuration) ALWAYS render even when no children have view permission. The filter is `isNotHidden(item.module) && (moduleVisible(item.module) || itemHasVisibleChildScoped(...))`. For items where `item.module` is undefined, both `isNotHidden(undefined) = true` and `moduleVisible(undefined) = true`, so the OR short-circuits true. The group label shows with no usable children. | Change filter to `isNotHidden(item.module) && (item.module ? moduleVisible(item.module) : itemHasVisibleChildScoped(item.children))`. |
| B16 | `src/components/MasterLayout.tsx:116-126` | `isSuperAdmin` only bypasses `moduleVisible`, not `isNotHidden`. A store-scoped super admin still has Stores/Categories/Users/Settings hidden. | Add `if (isSuperAdmin) return true;` to `isNotHidden` after the `!module` early return. |
| B17 | `src/components/MasterLayout.tsx:248-264` | `userMenuOpen` starts as `false`. The sign-out dropdown is not in the initial DOM, so it can only be exercised via client interaction. (Not a bug per se — but reduces the testable surface.) | No source fix needed; the test gap is documented. |

### Mock-incompleteness (documentation only)

| # | File:Line | Observation |
|---|---|---|
| B18 | `src/app/(admin)/media/actions.ts:29-51, 53-99, 101-109` | The chainable mock's `storage.from(bucket).list` and `storage.remove` always return `{ data, error: null }`. The source's error-handling branches (`if (error) console.error(...)` and `if (error) throw new Error(error.message)`) are untestable without extending the mock. P5 tests assert happy paths and skip error branches. To fix: add a `setStorageError(bucket, operation, error)` method to the mock. |
| B19 | `src/app/(admin)/dashboard/actions.ts` | When the source interleaves `.eq` calls on different builders in a sequence (the if block: `productQ.eq → orderQ.eq → ... → lowStockQ.eq`), the 8 `eq("store_id", ...)` calls all get grouped with the LAST `from(table)` chain (lowStockQ) in `chainsForTable("products")`. The actual builder closures have the eq on the correct chains, but the call-list walk merges them. P7 tests work around by counting total `eq` calls filtered by args. To fix: have the mock tag each call with the builder's `_chain` array reference and re-attribute during `chainsForTable`. |
| B20 | `test/mocks/require-permission.ts` | The mock does not validate action names against `PERMISSION_MODULES` structure. If the source uses `assertPermission("notifications", "create")` (a non-existent action for that module), the mock still allows it if the test sets `permissions: { notifications: ["create"] }`. This is why the production-blocking bug B1 wasn't caught by P6 tests — the test granted the literal string. To fix: have the mock throw `PermissionError` if the action string isn't in `PERMISSION_MODULES[module]`, unless the test explicitly opts out. |

### Test-design notes (not bugs)

| # | File:Line | Note |
|---|---|---|
| B21 | `src/app/(admin)/customers/actions.ts:69-83` | `getCustomers` (no storeId) does not re-fetch user records via `auth.admin.listUsers` after the initial call — it reuses the same `users` array via the second `listUsers` call. If the source's intent was to call `listUsers` twice and the calls return different data, the test would expose a race. Currently: only ONE `auth.admin.listUsers` call is made in the storeId path; the no-storeId path also makes one. (Not a bug — the test confirms behavior.) |
| B22 | `src/app/(admin)/staff/actions.ts:78-110` | `getStaff` `store_name` enrichment happens via a separate `stores` chain. The `chainsForTable("stores")` lookup is vulnerable to false positives if any other test or source builds a `stores` chain. The `resetSupabaseClients` between tests prevents this. |

### Summary by severity

| Severity | Count | Examples |
|---|---|---|
| Production-blocking | 1 | B1 (notifications permission) |
| Wrong SQL / data leakage | 4 | B2–B5 (storeId filter on joined queries) |
| Data integrity | 3 | B6 (multiple primaries), B7 (non-transactional delete), B8 (Staff role="admin" confusion) |
| Missing validation | 4 | B9 (state_code), B10 (delivery slot times), B11 (notification type), B12 (status "" bucketing) |
| Dead code | 2 | B13 (productSlug), B14 (ext ??"jpg") |
| UI / filter logic | 3 | B15 (group menu always shows), B16 (super admin not bypassed in isNotHidden), B17 (userMenu not in SSR DOM) |
| Mock-incompleteness | 3 | B18 (storage error paths), B19 (chainsForTable grouping), B20 (no PERMISSION_MODULES validation in mock) |
| Test-design notes | 2 | B21, B22 |
| **Total** | **22** | |

## Run commands

```bash
npm test              # vitest run — 626/626
npm run test:watch    # vitest (interactive)
npm run test:ui       # vitest --ui
npm run test:coverage # vitest run --coverage
npm run typecheck     # tsc --noEmit — clean
npm run lint          # eslint — exit 0 (0 errors, 50 warnings)
npm run build         # next build — success
```

## Test Strategy Recap

**Stack:** Vitest 4 + full Supabase mocks + GitHub Actions + `react-dom/server` for component smoke
**Coverage depth by module:**
- **Deep**: `permissions`, `require-permission`, `categories`, `products`, `orders`, `invoices`, `users`, `roles`, `stores`, `settings`, `commissions`, `staff`, `banners`, `media`, `delivery-zones`, `delivery-slots`, `gst-numbers`, `reports`, `dashboard`
- **Medium**: `customers`, `notifications`, `MasterLayout`, `PlaceholderPage`, `ImagePickerModal` (component smoke)
- **Light**: `inventory-log`
- **Not covered**: 3 API route files (`app/api/{migrate-wishlist,upload,auth/login/api}/route.ts`) — out of P1-P9 scope; `lib/redux/**` (UI-only, server tests can't reach)

**Coverage thresholds:** 70/60/70/70 on `src/lib/**` and `src/app/**/actions.ts` and `src/app/**/route.ts`.
**Actual coverage:** 93.37% statements, 85.99% branches, 92.53% functions, 94.27% lines — well above thresholds. No tuning needed.

## CI Workflow

`.github/workflows/test.yml` runs on push/PR to `main`/`master`:
1. `npm ci`
2. `npm run lint` — **exit 0** (0 errors, 50 warnings are non-blocking)
3. `npm run typecheck`
4. `npm test`
5. `npm run build`

**CI is green.** All 5 steps pass.

## Summary

| Metric | P1 start | P10 end |
|---|---|---|
| Test files | 1 (smoke) | 35 |
| Tests | 17 | 626 |
| Typecheck | clean | clean |
| Lint | 0 errors | 0 errors |
| Lint warnings | n/a | 50 (non-blocking) |
| Coverage | n/a | 93.37% / 85.99% / 92.53% / 94.27% |
| Source bugs surfaced | n/a | 22 (consolidated) |
| Source bugs fixed in P10 | n/a | 3 (edit page scope, new page scope, out-of-scope category UX) |
| CI green | ❌ | ✅ |

## Next Step

All 10 phases complete. **Test suite is production-ready.**

Future work (out of test-scope):
1. **Fix the 22 source bugs** documented in the consolidated "Source Bugs Surfaced" table. **B1 is production-blocking** — change `assertPermission("notifications", "create")` to `"send"`.
2. **Fix the `createProduct` store-assignment bug** (P10 open question Q2) — currently always assigns to the first active store, not the user's store. This was flagged in the P10 plan and deferred.
3. **Add API route tests** for `app/api/{migrate-wishlist,upload,auth/login/api}/route.ts` (currently 0% coverage).
4. **Clean up the 50 lint warnings** (mostly unused imports in test files and `<img>` → `<Image />` migrations).
5. **Tighten mock validation** (B19, B20) — have `chainsForTable` track builder closures and have `assertPermissionMock` validate against `PERMISSION_MODULES`.
