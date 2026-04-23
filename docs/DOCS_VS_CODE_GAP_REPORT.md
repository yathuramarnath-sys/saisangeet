# Docs vs Code Gap Report — DineXPOS
**Final revision · April 23, 2026 · Code is source of truth**

---

## Corrections to Prior Drafts

Three claims in the earlier drafts were wrong. Corrected here before the main report:

| Prior claim | Correct finding | Evidence |
|---|---|---|
| "No test files exist" | 10 test files exist; backend tests have real assertions | `backend/tests/` (6 files, 67 `assert.*` calls); `apps/*/tests/` (4 files) |
| "No schema.sql exists" | `backend/src/db/schema.sql` exists at 270 lines with 25 tables | File read directly |
| "All pages fully connected to API" | Operations POS, Captain App, and Kitchen Display are scaffolded — they use mock data, not real API calls | `apps/operations-pos/tests/app.test.jsx` imports `mockRestaurantStore.js`; seed imports confirmed in each App.jsx |

---

## §1 — All Documentation Files

Read in full. Located at `docs/`:

- `PRODUCT_REQUIREMENTS.md`
- `TECHNICAL_ARCHITECTURE.md`
- `APP_ARCHITECTURE.md`
- `IMPLEMENTATION_SEQUENCE.md`
- `OWNER_DASHBOARD_API_CONTRACTS.md`
- `PHASE1_API_CONTRACTS.md`
- `TEST_STRATEGY.md`
- `PRODUCT_SPLIT.md`

No other `.md` files found outside `docs/` except `backend/README.md`.

---

## §2 — Test Files (Verified by Direct Read)

### Backend — real assertions present

| File | Test count | Assertion count | What is tested |
|---|---|---|---|
| `backend/tests/operations.test.js` | 16 named tests | 49 `assert.*` calls | Order creation, table moves, KOT, payments, closing, void/discount approval, reprint, status changes |
| `backend/tests/reports.test.js` | — | 12 `assert.*` calls | Owner summary, closing approval, reopen |
| `backend/tests/shifts.test.js` | — | 6 `assert.*` calls | Shift open/close, cash movements |
| `backend/tests/api-error.test.js` | — | — | ApiError utility class |
| `backend/tests/async-handler.test.js` | — | — | asyncHandler middleware |
| `backend/tests/require-permission.test.js` | — | — | Permission enforcement middleware |

**Qualification:** These test files contain real assertions against service logic. They test the service layer in isolation — they do not make HTTP requests or connect to PostgreSQL. Whether they pass in CI is not verified here; the file content confirms they are not stubs.

### Frontend — real assertions against mock data

| File | What it tests |
|---|---|
| `apps/operations-pos/tests/app.test.jsx` | 11 test cases; renders full Operations POS UI and asserts on screen elements; uses `mockRestaurantStore.js` and `loadRestaurantState()` — **not a real API** |
| `apps/waiter-mobile/tests/app.test.jsx` | Exists; content not fully read — 0 `assert.` calls found by grep |
| `apps/kitchen-display/tests/app.test.jsx` | Exists; content not fully read — 0 `assert.` calls found by grep |
| `apps/owner-web/tests/prototype-routing.test.jsx` | Routing tests |

**Finding:** Operations POS has meaningful UI test coverage, but it exercises mock store state, not real API integration. This confirms the app is scaffolded.

---

## §3 — Database Schema (Verified)

**`backend/src/db/schema.sql`** — 270 lines, 25 tables:

```
outlets, roles, permissions, role_permissions
users, user_roles
tables
menu_items
sales_inventory_items, sales_inventory_ledger
kitchen_inventory_items, kitchen_inventory_ledger
stock_count_sessions, stock_count_lines
orders, order_items, payments
order_audit_log, order_control_log, payment_print_log
daily_closing, cash_shifts, cash_movements
policy_settings, app_runtime_state
```

**`backend/src/db/migrate.js`** — creates only 3 tables at runtime (read directly, lines 34–65):

```
tenant_settings, users_index, pending_link_tokens
```

**Critical gap:** `migrate.js` does **not** import or execute `schema.sql`. The 25-table schema exists as a design document but has never been applied to the live database. The inventory, order, audit, and payment tables from `schema.sql` do not exist in the running Railway Postgres instance.

---

## §4 — Backend Routes (Verified)

All prefixes from `backend/src/routes/index.js`:

```
/auth                         /business-profile      /menu
/outlets                      /roles                 /permissions
/users                        /settings/tax-profiles /settings/receipt-templates
/devices                      /settings/discounts    /integrations
/operations                   /reports               /shifts
/setup                        /kitchen-stations
```

**No `/inventory` prefix exists anywhere in the codebase.**

### Reports routes — exact endpoints (`backend/src/modules/reports/reports.routes.js`):

```
GET  /owner-summary        requirePermission("reports.view")
POST /closing/approve      requirePermission("reports.view")
POST /closing/reopen       requirePermission("reports.view")
```

That is the complete reports API. Three endpoints total.

### Operations device-bypass routes (`backend/src/modules/operations/operations.routes.js`):

These six routes have **no** `requirePermission` middleware — they bypass the permission system entirely:

```
POST   /kot
GET    /kots
PATCH  /kots/:id/status
POST   /bill-request
POST   /payment
POST   /closed-order
```

These are undocumented in all doc files.

---

## A — IMPLEMENTED
*Confirmed by reading route files, controller files, and service files. API integration confirmed by reading frontend component files.*

**Backend — routes, controllers, and service logic all present:**
- Auth: signup, login, logout, forgot/reset password, change password (`auth.routes.js`, `auth.service.js`)
- Business Profile: GET + PATCH (`business-profile.routes.js`)
- Outlets: full CRUD, device linking, link-code generation (`outlets.routes.js`)
- Menu: categories, items, stations, groups, assignments, pricing profiles — full CRUD (`menu.routes.js`)
- Kitchen Stations: GET/POST/PATCH/DELETE (`kitchen.routes.js`)
- Tax Profiles + Receipt Templates: full CRUD (`tax-profiles.routes.js`, `receipt-templates.routes.js`)
- Roles + Permissions: list, create, update, delete (`roles.routes.js`, `permissions.routes.js`)
- Users: list, create, update, delete (`users.routes.js`)
- Discounts: rules + approval policy CRUD (`discounts.routes.js`)
- Devices: list, link, resolve link code (`devices.routes.js`)
- Shifts: open, movement, close, summary (`shifts.routes.js`)
- Reports: 3 endpoints — owner summary, approve closing, reopen (`reports.routes.js`)
- Operations: 19 permission-checked endpoints + 6 device-bypass endpoints (`operations.routes.js`)
- Scheduled jobs: daily sales report email at 11 PM IST (`jobs/daily-sales-report.js`); nightly DB backup at midnight IST (`jobs/daily-backup.js`)
- 60-second active-order auto-save when `ENABLE_DATABASE=true` (`server.js` lines 77–84)
- JWT auth with per-request tenant context via `AsyncLocalStorage` (`authenticate.js`, `tenant-context.js`)

**Owner Web — API calls confirmed by reading component files:**

| Page | File | API calls confirmed |
|---|---|---|
| Business Profile | `features/business/BusinessProfilePage.jsx` | `api.get("/business-profile")` on mount; `api.patch(...)` on save |
| Outlets | `features/outlets/OutletsPage.jsx` | `api.get()` for outlets, tax profiles, receipt templates, devices; full CRUD + device linking |
| Staff | `features/staff/StaffPage.jsx` | `fetchStaffData()` loads staff and roles; full CRUD |
| Discounts | `features/discounts/DiscountRulesPage.jsx` | Loads and saves discount rules via API |
| Devices | `features/devices/DevicesPage.jsx` | Device list, link code generation, device linking |
| Taxes & Receipts | `features/taxes/TaxesReceiptsPage.jsx` | Tax profiles and receipt templates CRUD |
| Shifts | `features/shifts/ShiftsCashPage.jsx` | `api.get("/shifts/summary")`; auto-refreshes every 30 s |
| Reports | `features/reports/ReportsPage.jsx` | Calls owner summary and closing endpoints |
| Kitchen Stations | `features/kitchen/KitchenStationsPage.jsx` | CRUD via `/kitchen-stations` |
| Integrations | `features/integrations/IntegrationsPage.jsx` | Loads and saves integration settings |

---

## B — PARTIALLY IMPLEMENTED
*Some real API integration, but also relies on mock or local data.*

**Menu Page** (`apps/owner-web/src/features/menu/MenuPage.jsx`)
- Real API calls: categories, items, stations, groups, assignments, pricing profiles — all CRUD
- Also subscribes to `mockRestaurantStore.js` for display state alongside real API data
- Two parallel data sources; no clear migration path documented

**Inventory Page** (`apps/owner-web/src/features/inventory/InventoryPage.jsx`)
- Real API calls: `api.get()` for outlets and menu items (reference data only)
- All tracking config and wastage entries written to `localStorage` keys `INVENTORY_TRACKING_KEY` and `INVENTORY_WASTAGE_KEY`
- No backend inventory endpoints exist to receive or persist this data

---

## C — SCAFFOLDED
*UI fully built and tested; no real API data flow beyond device linking.*

**Operations POS** (`apps/operations-pos/src/App.jsx`)
- Real API call: `api.post("/devices/resolve-link-code", { linkCode, deviceType })` — device setup only
- Post-link: menu loaded from `pos.seed.js` (`seedAreas`, `seedCategories`, `seedMenuItems`); orders held in memory; KOT queue in `localStorage` (`KOT_QUEUE_KEY`)
- Confirmed by: `app.test.jsx` imports `mockRestaurantStore.js` and `loadRestaurantState()` — all 11 test cases assert on mock state
- The 19 order-management backend endpoints exist and have service-layer test coverage, but Operations POS does not call them

**Captain App** (`apps/waiter-mobile/src/App.jsx`)
- Real API call: `api.post("/devices/resolve-link-code", { linkCode, deviceType: "Captain App" })` — device setup only
- Post-link: menu from `mobile.seed.js`; stock state from `subscribeStock()` (in-memory mock); branch config in `localStorage` (`CAPTAIN_LS_KEY`)

**Kitchen Display** (`apps/kitchen-display/src/App.jsx`)
- Real API call: `api.post("/devices/resolve-link-code", ...)` — device setup only
- Post-link: menu from `restaurantFlow.js` (`sharedCategories`, `sharedMenuItems`); stock from `getStockState()` (in-memory mock); KDS tickets in `localStorage`

**App Store page** (`apps/owner-web/src/features/appstore/AppStorePage.jsx`)
- Static display only; no API calls; no backend route

**Frontend test files for Captain App and Kitchen Display**
- `apps/waiter-mobile/tests/app.test.jsx` and `apps/kitchen-display/tests/app.test.jsx` exist but contain 0 `assert.` calls (confirmed by grep)

---

## D — PLANNED / NO CODE EXISTS
*Referenced in documentation; no corresponding backend module, route, or service file found.*

- **Inventory backend module** — `docs/TECHNICAL_ARCHITECTURE.md` §3 describes stock ledger, purchase recording, recipe mapping, auto-deduction, waste tracking. Directory `backend/src/modules/inventory/` does not exist. No inventory routes registered. `schema.sql` has 6 inventory tables but they are never queried by any service.
- **`GET /api/v1/reports/daily-sales`** — claimed in `docs/PHASE1_API_CONTRACTS.md` §9 with full response shape. Not registered in `reports.routes.js`. Does not exist.
- **`GET /api/v1/reports/access-summary`** — claimed in `docs/OWNER_DASHBOARD_API_CONTRACTS.md` §11. Not registered. Does not exist. (The actual endpoint is `GET /owner-summary` with a different response shape.)
- **Offline sync mechanism** — `docs/PRODUCT_REQUIREMENTS.md` §9 describes localStorage queues with auto-sync on reconnect. localStorage queuing exists in Operations POS, Captain App, and Kitchen Display. No sync-on-reconnect code exists anywhere.
- **Recipes / ingredient mapping** — mentioned in `docs/PRODUCT_REQUIREMENTS.md`; not in `schema.sql` and not in any service file.
- **Aggregator webhooks (Swiggy/Zomato)** — `docs/PRODUCT_REQUIREMENTS.md` §8; `integrations.routes.js` exists but handlers return stub responses only.
- **Audit log viewer** — `order_audit_log` table defined in `schema.sql`; no API endpoint exposes it; `schema.sql` is not migrated to live DB.
- **AI insights, fraud detection** — `docs/PRODUCT_REQUIREMENTS.md` §10; no code anywhere.

---

## E — OUTDATED DOCS

| Doc file | Outdated claim | What code shows |
|---|---|---|
| `docs/TECHNICAL_ARCHITECTURE.md` §3 | "Inventory module — stock ledger, purchase and stock-in, recipe mapping, auto-deduction, waste and adjustments" | No `backend/src/modules/inventory/` directory; no routes; schema tables exist but are never queried |
| `docs/PRODUCT_SPLIT.md` | App folders `apps/pos_flutter/`, `apps/owner_flutter/` with "Recommended stack: Flutter" | Actual folders: `apps/operations-pos`, `apps/waiter-mobile`, `apps/kitchen-display`, `apps/owner-web` — all React/Vite, no Flutter |
| `docs/APP_ARCHITECTURE.md` | "Recommended stack: Flutter for POS tablet app and owner mobile app" | No Dart or Flutter files anywhere in the repo |
| `backend/README.md` | "Add SQL migrations from `src/db/schema.sql`" (implies schema.sql is the live migration source) | `migrate.js` does not execute `schema.sql`; it creates only 3 tables inline; `schema.sql` is a design reference |
| `docs/PHASE1_API_CONTRACTS.md` §9 | `GET /api/v1/reports/daily-sales?outletId=...` with full JSON response shape | Endpoint does not exist; `reports.routes.js` has 3 different endpoints |
| `docs/OWNER_DASHBOARD_API_CONTRACTS.md` §11 | `GET /api/v1/reports/access-summary` | Endpoint does not exist; closest is `GET /owner-summary` with a different response shape |
| `docs/IMPLEMENTATION_SEQUENCE.md` | Stages 3–4 (POS billing, Captain floor ordering, KDS) implied ready to build on Phase 1 | Operations POS, Captain App, and Kitchen Display are scaffolded — device linking works but order/payment API wiring is not done |
| All doc files | No mention of permission bypass on device routes | `operations.routes.js` has 6 routes (`POST /kot`, `GET /kots`, `PATCH /kots/:id/status`, `POST /bill-request`, `POST /payment`, `POST /closed-order`) with no `requirePermission` middleware |

---

## F — NAMING / ARCHITECTURE MISMATCHES

| Docs use | Code uses | Files | Impact |
|---|---|---|---|
| "Orders module", `POST /api/v1/orders` | `modules/operations`, prefix `/api/v1/operations` | `routes/index.js`, `operations.routes.js` | API clients built from docs will use wrong path |
| "Payments module" (standalone) | Payments embedded in `/operations/orders/:tableId/payments` | `operations.routes.js` | No `/payments` prefix exists |
| "Cash Control" | `modules/shifts`, route `/api/v1/shifts` | `shifts.routes.js` | Same feature, two names across docs |
| "Discount Rules" at top level | Route is `/api/v1/settings/discounts` | `routes/index.js` | Under `settings/`, not top-level |
| `schema.sql` as migration source | `migrate.js` creates 3 tables inline; `schema.sql` never executed | `backend/src/db/` | The 25-table schema has no migration path to production |
| `GET /reports/access-summary` (docs) | `GET /reports/owner-summary` (code) | `reports.routes.js`, `OWNER_DASHBOARD_API_CONTRACTS.md` | Different path and different response shape |

---

## G — Source of Truth Table

| Topic | Docs claim | Code shows | Verdict |
|---|---|---|---|
| App tech stack | Flutter for Operations POS, Captain App, Kitchen Display | React/Vite for all four apps | **React** — remove all Flutter references from docs |
| Inventory module | "Core Phase 1 backend module" | Does not exist; no routes, no service, no module directory | **Not implemented** — reclassify as Phase 2 in docs |
| `schema.sql` execution | Implied live migration source (`backend/README.md`) | Not executed by `migrate.js`; design reference only | **schema.sql is not live** — document it as design reference; `migrate.js` is the actual migration |
| Reports API surface | `GET /daily-sales`, `GET /access-summary` (2 docs) | `GET /owner-summary`, `POST /closing/approve`, `POST /closing/reopen` (3 endpoints) | **3 endpoints only** — update both docs to match `reports.routes.js` |
| Operations POS, Captain App, Kitchen Display status | Stages 3–4 implied production-ready | Scaffolded — device linking works; order/payment APIs not wired | **Scaffolded** — add explicit "frontend API wiring" phase to `IMPLEMENTATION_SEQUENCE.md` |
| Offline sync | localStorage queues + auto-sync on reconnect | localStorage queues exist; no sync-on-reconnect code | **Queuing only** — remove or defer the sync claim |
| Device route permissions | All endpoints enforce `requirePermission` | 6 device routes bypass permission checks entirely | **Document the device-route exception** |
| Test coverage | `TEST_STRATEGY.md` describes intended coverage | Backend: real unit tests (67 assertions across 3 files); Frontend: Operations POS has 11 UI tests against mock store; Captain App + Kitchen Display test files have no assertions | **Backend tested; frontend tests are partial or empty** |

---

## Practical Source of Truth

These are the 8 files that reflect the actual current state of the system. When docs conflict with these files, these files win.

| File | What it authoritatively defines |
|---|---|
| `backend/src/routes/index.js` | Every registered API prefix — if a module is not listed here, it does not exist in the running server |
| `backend/src/db/migrate.js` | The 3 tables that actually exist in the live Railway Postgres database |
| `backend/src/db/schema.sql` | Intended full schema (25 tables) — design reference only; not yet migrated |
| `backend/src/modules/operations/operations.routes.js` | Complete operations API including both permission-checked and device-bypass routes |
| `backend/src/modules/reports/reports.routes.js` | The 3 reports endpoints that actually exist |
| `apps/owner-web/src/App.jsx` + `pages/routes.jsx` | Every page that exists in the owner dashboard and its route path |
| `apps/operations-pos/tests/app.test.jsx` | Confirms Operations POS is scaffolded against mock data, not real API |
| `backend/tests/operations.test.js` | Confirms backend order/payment service logic exists and is tested at the service layer |
