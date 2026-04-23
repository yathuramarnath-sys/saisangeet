# Feature Work Prompt Template
## DineXPOS Monorepo

Copy this template at the start of any new feature, bug fix, or refactor session.
Fill in the bracketed sections. Leave the grounding rules and file-read checklist intact.

---

## Feature Request

**What to build / fix:**
> [One paragraph. State the outcome, not the implementation. Example: "When a cashier closes an order, the closed-order record must be persisted to Postgres immediately so a server restart does not lose today's sales total."]

**Affected app(s):**
> [ ] Owner Web (`apps/owner-web`)
> [ ] Operations POS (`apps/operations-pos`)
> [ ] Captain App (`apps/waiter-mobile`)
> [ ] Kitchen Display (`apps/kitchen-display`)
> [ ] Backend only
> [ ] Shared package (`packages/`)

**Entry point (where the change starts):**
> [Example: "User clicks Close Order in Operations POS → `POST /api/v1/operations/closed-order` → `deviceCloseOrderHandler` → `addClosedOrder()` in `closed-orders-store.js`"]

---

## Grounding Rules
*These apply to every session. Do not skip them.*

**Read before changing.**
Before writing or editing any file, read:
- The file you plan to change
- Every file it imports that is relevant to the feature
- The corresponding test file if one exists

**Do not assume architecture that may not exist.**
The following are known to be absent or incomplete in this repo. Do not generate code that depends on them unless the feature explicitly creates them:
- No `/api/v1/inventory` backend module or routes
- `schema.sql` (25 tables) is not executed by `migrate.js` — the live database has only `tenant_settings`, `users_index`, `pending_link_tokens`, and `app_runtime_state`
- Operations POS, Captain App, and Kitchen Display are scaffolded against `mockRestaurantStore` — they do not call the order/payment/KOT backend APIs yet
- No refresh token rotation — auth is 30-day JWT only
- No rate limiting middleware exists
- No offline sync mechanism — `localStorage` queues are write-only

**Respect the write-safety pattern.**
This repo has two write modes for `owner-setup-store`. Use the correct one:
- `updateOwnerSetupData(fn)` — fire-and-forget Postgres write. Safe only for non-critical display data.
- `updateOwnerSetupDataNow(fn)` — awaited Postgres write. Required for anything that must survive a server restart: passwords, link tokens, device records, shift open/close.
When in doubt, use `updateOwnerSetupDataNow`.

**Respect tenant context.**
All data reads and writes go through `getCurrentTenantId()` via `AsyncLocalStorage`. Unauthenticated routes have no tenant context set — `getCurrentTenantId()` returns `"default"`. If a write must target a specific tenant on an unauthenticated route, wrap it explicitly: `runWithTenant(tenantId, async () => { ... })`.

**Use existing names.**
Do not rename or re-route established module paths. The canonical names are:
- Orders live under `modules/operations`, route prefix `/api/v1/operations` — not `/orders`
- Cash control lives under `modules/shifts`, route prefix `/api/v1/shifts` — not `/cash-control`
- Discount rules live at `/api/v1/settings/discounts` — not `/discounts`
- Device apps authenticate via `POST /devices/resolve-link-code`, not `/devices/auth`

**Match the module file pattern.**
Every backend module follows: `module.routes.js` → `module.controller.js` → `module.service.js` → (optional) `module.repository.js`. Do not add logic directly in the controller. Do not add DB calls in the service. If a new module is needed, create all four files.

---

## Required Pre-Work Reads

Before proposing any change, read and acknowledge each file below that is relevant to the feature. Mark each as read or "not applicable."

### Backend
- [ ] `backend/src/routes/index.js` — confirm the affected route prefix is registered
- [ ] `backend/src/modules/[affected-module]/[module].routes.js`
- [ ] `backend/src/modules/[affected-module]/[module].controller.js`
- [ ] `backend/src/modules/[affected-module]/[module].service.js`
- [ ] `backend/src/data/owner-setup-store.js` — if the feature touches owner config
- [ ] `backend/src/modules/operations/operations.memory-store.js` — if touching orders, KOTs, or shifts
- [ ] `backend/src/modules/operations/closed-orders-store.js` — if touching closed orders or sales
- [ ] `backend/src/modules/operations/shifts-store.js` — if touching shifts
- [ ] `backend/src/db/migrate.js` — if adding a new table; confirm it does not depend on schema.sql
- [ ] `backend/src/middleware/authenticate.js` — if the route has auth or tenant context implications
- [ ] `backend/tests/[affected-module].test.js` — if a test file exists

### Frontend (read the relevant page file)
- [ ] `apps/owner-web/src/features/[page]/[Page].jsx`
- [ ] `apps/owner-web/src/lib/AuthContext.jsx` — if touching auth state
- [ ] `apps/operations-pos/src/App.jsx` lines 1–100 — if touching POS flow (note: uses mockRestaurantStore)
- [ ] `apps/waiter-mobile/src/App.jsx` lines 1–100 — if touching Captain App
- [ ] `apps/kitchen-display/src/App.jsx` lines 1–100 — if touching KDS

---

## Phase 1 — Analysis (complete before writing any code)

Answer each question based on what you read, not what you assume.

**1. What currently exists?**
> Describe the current state of the relevant module(s). Name the specific files and functions involved. If the module does not exist, say so explicitly.

**2. What is missing or broken?**
> List the specific gaps: missing endpoint, wrong write mode, missing field, incorrect tenant context, etc. Cite the file and line number where possible.

**3. What will break if unchanged?**
> Describe the production failure mode. Example: "Server restart between order close and Postgres write loses today's closed-order record from the sales summary."

**4. What are the boundaries of this change?**
> Name every file that will be created or modified. Name every file that must NOT be changed. Flag any file that is shared across multiple apps.

**5. Are there any risks in this change?**
> Consider: Does this touch in-memory state that other modules read? Does it change a Postgres write path? Does it affect a shared package used by test fixtures? Does it change a route path that existing devices have cached?

---

## Phase 2 — Proposed Changes

Write this section before touching any file. Get agreement before moving to Phase 3.

**Files to create:**
```
backend/src/modules/[new-module]/[new-module].routes.js    — reason
backend/src/modules/[new-module]/[new-module].service.js   — reason
```

**Files to modify:**
```
backend/src/routes/index.js                                 — register new route prefix
backend/src/modules/[module]/[module].service.js            — add X function
apps/owner-web/src/features/[page]/[Page].jsx               — add API call for Y
```

**Files that must not change:**
```
packages/shared-types/src/mockRestaurantStore.js            — changing this breaks all POS tests
backend/src/db/migrate.js                                   — no schema changes without explicit instruction
```

**New API contract (if applicable):**
```
METHOD /api/v1/[route]
Auth:        requireAuth + requirePermission("[permission.code]")  |  device-bypass (no permission)
Request:     { field: type, ... }
Response:    { field: type, ... }
Error codes: [ERROR_CODE] — when
```

**New Postgres table (if applicable):**
> Describe the table. Add the `CREATE TABLE IF NOT EXISTS` block to `migrate.js` directly — do NOT add it to `schema.sql`. Follow the existing pattern: `TEXT PRIMARY KEY`, `TIMESTAMPTZ NOT NULL DEFAULT NOW()`.

**Write safety decision:**
> Will this use `updateOwnerSetupData` (fire-and-forget) or `updateOwnerSetupDataNow` (awaited)? Why?

**Tenant context decision:**
> Will this run inside `runWithTenant`? Which tenant ID will be used and where does it come from?

---

## Phase 3 — Implementation

Implement in this order. Do not skip steps.

1. **Backend service function** — pure logic, no Express objects, no `req`/`res`
2. **Backend controller handler** — calls service, returns `res.json(result)`; wraps with `asyncHandler`
3. **Backend route registration** — add to the module's `.routes.js` with correct middleware chain
4. **Register the router** (if new module) — add to `backend/src/routes/index.js`
5. **Frontend API call** — add to the relevant `.jsx` component or service file; use `api.get/post/patch`
6. **Test** — add at least one test case to `backend/tests/[module].test.js`; use `assert.strictEqual` or `assert.ok`

For each file changed, state what changed and why before showing the diff or edit.

---

## Phase 4 — Verification Checklist

Run through this before marking the feature done.

- [ ] All new routes are registered in `backend/src/routes/index.js`
- [ ] All Postgres writes that must survive restart use `updateOwnerSetupDataNow` or a direct `await query(...)`
- [ ] No new route bypasses `requirePermission` unless it is intentionally a device-bypass route (document the reason inline)
- [ ] No new code imports from `mockRestaurantStore` outside of test files
- [ ] If a new Postgres table was added, the `CREATE TABLE IF NOT EXISTS` block is in `migrate.js`, not `schema.sql`
- [ ] If tenant context is needed on an unauthenticated route, `runWithTenant(tenantId, fn)` is called explicitly
- [ ] The `OWNER_DASHBOARD_API_CONTRACTS.md` or `PHASE1_API_CONTRACTS.md` doc has been updated if a new public endpoint was added
- [ ] No file that was listed under "must not change" was changed

---

## Known Gotchas (keep for every session)

| Gotcha | Detail |
|---|---|
| Fire-and-forget vs awaited writes | `updateOwnerSetupData` drops changes on restart. Use `updateOwnerSetupDataNow` for anything that must persist. |
| Tenant context on unauthenticated routes | `getCurrentTenantId()` returns `"default"` when no JWT is present. Forgot-password and reset-by-token must call `runWithTenant(tenantId, fn)` explicitly. |
| Operations POS uses mock data | `apps/operations-pos` does not call the order API. Changing `operations.service.js` will not affect POS behaviour until the app is wired. |
| schema.sql is not live | The 25-table schema in `backend/src/db/schema.sql` has never been executed. Do not reference those tables from service code. |
| Inventory module does not exist | `backend/src/modules/inventory/` is absent. `InventoryPage.jsx` in owner-web reads/writes only `localStorage`. |
| Device-bypass routes | `POST /kot`, `GET /kots`, `PATCH /kots/:id/status`, `POST /bill-request`, `POST /payment`, `POST /closed-order` have no `requirePermission`. This is intentional but undocumented everywhere except `operations.routes.js`. |
| Two POS apps | `apps/operations-pos` (cashier terminal) and `apps/waiter-mobile` (floor staff) are separate apps with separate device types and separate seed files. A change to one does not affect the other. |
| Outlet linked by name, not ID | `users[].outletName` is a string. Renaming an outlet in Outlets page does not update user assignments. Do not compound this pattern. |
