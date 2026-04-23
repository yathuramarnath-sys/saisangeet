# Today's Progress — 2026-04-23

**Session type:** Backend + Frontend runtime integration + Android APK builds  
**Starting point:** All three device apps (POS, KDS, Captain) were scaffold/mock-only — no real backend order state  
**End state:** All three apps fully wired to real backend order APIs; two updated Android APKs built

---

## ⚠ Do Not Forget

1. **Test tenant vs client tenant separation** — Always verify which tenant is active before testing. The backend resolves tenant from the device token. If you link a device with a test-tenant link code, all orders, menus, and tables will belong to the test tenant — not the client's live tenant. Never mix link codes between tenants. Check `req.user.tenantId` in backend logs if order/table data looks wrong.

2. **Clear browser/app state before relinking** — Before linking a device to a different outlet or tenant, clear all local storage first:
   - POS: clear `pos_branch_config` and `pos_token` keys in localStorage
   - Captain: clear `captain_branch_config` and `captain_token` keys in localStorage
   - KDS: clear `kds_branch_config` and `kds_token` keys in localStorage
   Failing to clear stale state causes the app to boot with the old outlet's token and menu, silently sending data to the wrong outlet even after re-linking.

3. **POS / Captain / KDS must all use the same outlet** — All three apps must be linked to the **same `outletId`**. KOTs sent from POS appear on KDS only because both join the socket room `outlet:${outletId}`. If POS is on outlet A and KDS is on outlet B, KOTs will never arrive. Verify the `outletId` in each app's branch config matches before any live test. The outlet mapping is visible in Owner Web → Outlets.

4. **APK builds confirmed working** — Both Android APKs for this session built successfully:
   - `apps/kitchen-display/android/app/build/outputs/apk/debug/app-debug.apk` — KDS v1.1
   - `apps/waiter-mobile/android/app/build/outputs/apk/debug/app-debug.apk` — Captain v1.2
   Build requires `JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"` — Java is **not** on the system PATH. Always set this explicitly before running `./gradlew`. Captain release signing keystore (`dinex-captain.jks`) must be placed at `~/Desktop/` to produce a signed release APK.

---

## 1. What Was Completed Today

Eight integration slices shipped across POS, KDS, and Captain apps, plus Android builds for KDS and Captain:

| # | Slice | App(s) | Status |
|---|-------|--------|--------|
| 1 | POS get-or-create order on table open + server-wins item reconcile | `operations-pos` | ✅ Done |
| 2 | POS KOT / bill-request / payment / close-order wired to backend | `operations-pos` | ✅ Done |
| 3 | Sync safety — table reset gated on `backendConfirmed` | `operations-pos` | ✅ Done |
| 4 | KDS wired to real backend KOT state (bump, advance, socket) | `kitchen-display` | ✅ Done |
| 5 | Station routing — `item.station` flows end-to-end through POS→KOT→KDS | `operations-pos`, `kitchen-display` | ✅ Done |
| 6 | Per-station KOT grouping + `stationName` in POS payload | `operations-pos` | ✅ Done |
| 7 | Captain App wired to real backend order state (get-or-create, item add, KOT) | `waiter-mobile` | ✅ Done |
| 8 | Android APKs built for KDS (v1.1) and Captain (v1.2) | Build system | ✅ Done |

---

## 2. Code Changes Made

### `backend/src/modules/operations/operations.memory-store.js`
- Added `getOrCreateOrder(tableId)` — returns existing order or creates fresh empty one for known tables; throws `TABLE_NOT_FOUND` (not `ORDER_NOT_FOUND`) for unknown tableIds
- Added `clearOrderAfterSettle(tableId)` — resets table slot to fresh `buildEmptyOrder`; silently skips counter/online IDs

### `backend/src/modules/operations/operations.repository.js`
- Added `fetchOrCreateOrderByTable(tableId)` using `runWrite`
- Added `clearTableOrderAfterSettle(tableId)` using `runWrite`

### `backend/src/modules/operations/operations.service.js`
- Added `getOrCreateOrderForTable(tableId)`
- Added `clearTableAfterSettle(tableId)`

### `backend/src/modules/operations/operations.controller.js`
- Added `deviceGetOrCreateOrderHandler` — `GET /operations/order?tableId=...`
- Added `deviceAddOrderItemHandler` — `POST /operations/order/item`
- Updated `deviceSendKotHandler` — now accepts + stores `stationName`, `areaName`, `orderId`; KOT object carries `station` and `areaName` fields; marks backend order items `sentToKot: true`; returns `{ kot, order? }`
- Updated `deviceBillRequestHandler` — calls `requestBillForOrder`, returns `{ ok, order? }`
- Updated `devicePaymentHandler` — calls `addPaymentToOrder`, swallows `INVALID_PAYMENT_AMOUNT`, returns `{ ok, order? }`
- Updated `deviceCloseOrderHandler` — calls `clearTableAfterSettle` after recording; broadcasts `sales:updated` socket event
- Deduplicated import block (fixed accidental double-destructuring)

### `backend/src/modules/operations/operations.routes.js`
- Registered `GET /order` and `POST /order/item` as device-bypass routes (`requireAuth` only, no `requirePermission`)

### `backend/tests/operations.test.js`
- Added 7 new tests: `getOrCreateOrder` idempotence, `addOrderItem` stationName storage + default, `updateKotStatus` bumped removal + preparing update, KOT `station`/`areaName` field preservation
- Route registration test updated to cover all 8 device-bypass routes
- **Current result: 22/25 pass** (3 pre-existing env-dependent failures unrelated to today's work)

### `apps/operations-pos/src/App.jsx`
- **`handleSelectTable`** (new): calls `GET /operations/order?tableId=...`; server-wins reconcile with `localOnlyUnsent` preservation
- **`handleAddItem`**: sends `POST /operations/order/item`; adds `station: item.station || ""` to order item; adds `stationName: item.station || ""` to backend payload
- **`handleSendKOT`**: groups unsent items by `item.station || "__default__"` into `stationGroups`; sends one `POST /operations/kot` per station group with `stationName`, `areaName`, `kotNumber`; reconciles from last server response
- **`handleRequestBill`**: sends `POST /operations/bill-request`, applies `result.order`
- **`handleSettle`**: `backendConfirmed` flag — local table reset + socket broadcast only fire if `POST /operations/closed-order` succeeds; each payment loop calls `POST /operations/payment`

### `apps/kitchen-display/src/App.jsx`
- **`handleAdvance`**: fixed `api.patch` URL to include `?outletId=${branchConfig?.outletId}` (was silently 404ing)
- **`handleBump`**: replaced `socket.emit("kot:bumped")` (no server listener) with `api.patch(/operations/kots/:id/status?outletId=..., { status: "bumped" })`
- **`kot:status` socket handler**: `status === "bumped"` → `filter` (removal); other statuses → `map` (update)

### `apps/waiter-mobile/src/App.jsx`
- **`handleSelectTable`** (made async): calls `GET /operations/order?tableId=...`; server-wins reconcile
- **`addItem` in `OrderScreen`**: adds `station: item.station || ""` to new item; calls `onAddItem?.(itemToSync)` callback
- **`handleAddItem`** (new in App root): calls `POST /operations/order/item`; server-wins reconcile
- **`handleSendKOT`**: per-station grouping (mirrors POS); sends `stationName`, `areaName`, `kotNumber`, `orderId`, `actorName` per group; reconciles from last server response
- `OrderScreen` props: added `onAddItem` to destructuring + JSX pass-through

### `apps/kitchen-display/android/app/build.gradle`
- `versionCode` 1 → 2, `versionName` "1.0" → "1.1"

### `apps/waiter-mobile/android/app/build.gradle`
- `versionCode` 2 → 3, `versionName` "1.1" → "1.2"

---

## 3. Commits Created Today

All on `main` branch:

```
810dde4  feat(pos): wire item-add to backend via new device-bypass route
ceb4a93  feat(pos): complete first integration slice — real order get-or-create, item reconcile, merge fix
91f80d9  feat(pos): slice 2 — wire KOT/bill-request/payment/close to backend order state
599cb9a  fix(pos): gate table reset on backend confirmation to prevent Captain/POS/backend split-brain
41d8aa4  feat(kds): slice 3 — wire kitchen-display to real backend KOT state
3c8862f  fix(pos/kds): wire stationName through KOT payload per station group
5101984  feat(pos): station slice — propagate item.station through order item and backend payload
7500ecd  feat(captain): wire waiter-mobile to real backend order state
```

> The APK version bumps (`build.gradle` edits) were **not separately committed** — they need to be committed before next session starts.

---

## 4. Android APKs Built

| App | APK path | Version | Size | Build type | Built at |
|-----|----------|---------|------|------------|----------|
| DineX KDS | `apps/kitchen-display/android/app/build/outputs/apk/debug/app-debug.apk` | 1.1 (versionCode 2) | 4.0 MB | debug | 2026-04-23 20:53 |
| DineX Captain | `apps/waiter-mobile/android/app/build/outputs/apk/debug/app-debug.apk` | 1.2 (versionCode 3) | 4.0 MB | debug | 2026-04-23 20:53 |

**Build command used (both apps):**
```bash
npm run build
npx cap sync android
JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home" ./gradlew clean assembleDebug
```

**Why debug, not release (Captain):**  
`apps/waiter-mobile/android/app/build.gradle` has a `signingConfigs.release` block referencing `~/Desktop/dinex-captain.jks` with password `Dinex@123`, but the keystore file was not present on the Desktop at build time.  
To produce a signed release APK: place `dinex-captain.jks` on the Desktop and run `./gradlew assembleRelease` from `apps/waiter-mobile/android/`.

---

## 5. Issues Debugged and Fixed

### 5a. KDS `handleBump` was a no-op
`socket.emit("kot:bumped")` had no server-side listener — KOTs accumulated in `kot-store` forever and were never removed. Fixed by replacing with `api.patch(/operations/kots/:id/status?outletId=..., { status: "bumped" })`.

### 5b. KDS `handleAdvance` silently 404'd
`PATCH /operations/kots/:id/status` was called without `?outletId=...`. `deviceUpdateKotStatusHandler` reads `outletId` from `req.query`; without it all status-change calls returned 404 silently. Fixed by appending `?outletId=${branchConfig?.outletId}` to the URL.

### 5c. `stationName` missing from POS KOT payload
`stationGroups` was computed inside the `if (kotAutoSendEnabled())` print block, putting it out of scope for the API call. All KOTs defaulted to "Main Kitchen" regardless of real station. Fixed by extracting `stationGroups` above both blocks and looping over groups for both print and API.

### 5d. Duplicate controller imports (Captain build error during dev)
`requestBillForOrder` and `addPaymentToOrder` were accidentally destructured twice when adding `clearTableAfterSettle` to the controller. Fixed by replacing the entire import block with a clean deduplicated version.

### 5e. Android Gradle build — `Unable to locate Java Runtime`
`./gradlew` could not find Java because JDK is not on the system PATH. Fixed by setting `JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"` before each `./gradlew` call.

### 5f. Captain `assembleDebug` failed with stale AAR metadata
`capacitor-android:bundleDebugAar` referenced a build/intermediates path that didn't exist after `cap sync` refreshed sources. Fixed by running `./gradlew clean assembleDebug` instead of `assembleDebug` alone.

---

## 6. Testing / Setup Issues Still Open

### 6a. 3 pre-existing test failures in `backend/tests/operations.test.js`
Tests: `operations summary returns cashier and approval queues`, `create demo order uses the next available table`, `move table transfers active order`. These call `buildOwnerTableCatalog()` which reads real Postgres tenant data. They expect fixture IDs (`f1`, `f2`) but get real tenant table IDs. **These predate today's work** — not introduced by any change here. Needs a proper test fixture or mocked catalog.

### 6b. Captain release APK signing keystore missing
`dinex-captain.jks` referenced in `build.gradle` was not present at `~/Desktop/` at build time. Current APK is unsigned debug. The keystore needs to be stored in a safe location (not just Desktop) and the `build.gradle` path updated accordingly.

### 6c. KDS APK has no release signing config at all
`apps/kitchen-display/android/app/build.gradle` has no `signingConfigs` block. Only debug APKs can be produced until a keystore is created and wired in (same pattern as Captain).

### 6d. `operations-pos` has no Android/Capacitor setup
POS is currently web-only (no `android/` folder, no `capacitor.config.ts`). If a POS tablet/Android build is needed in future, Capacitor needs to be initialized.

---

## 7. What Should Be Done Next (in exact order)

1. **Commit the `build.gradle` version bumps** — these were not committed after the APK builds:
   ```bash
   git add apps/kitchen-display/android/app/build.gradle \
           apps/waiter-mobile/android/app/build.gradle
   git commit -m "build: bump KDS to v1.1 and Captain to v1.2 for Apr 23 release"
   ```

2. **Fix the 3 pre-existing test failures** — mock or seed `buildOwnerTableCatalog()` with fixture table IDs `f1`/`f2` so the test env doesn't depend on real Postgres tenant data.

3. **Set up Captain release signing properly** — generate or recover `dinex-captain.jks`, store it in a reproducible location (e.g. `apps/waiter-mobile/android/` or a secrets folder), update `build.gradle` `storeFile` path, and produce a proper signed release APK.

4. **Add KDS release signing** — same pattern as Captain; create a keystore for `in.dinexpos.kds`, add `signingConfigs.release` to `apps/kitchen-display/android/app/build.gradle`.

5. **POS Integration: owner-web live sales dashboard** — `POST /operations/closed-order` already broadcasts `sales:updated` socket event; the owner-web Reports page needs to subscribe and live-update the today's sales figure without a page refresh.

6. **Waiter-mobile: bill settle / payment flow** — Captain currently only sends bill requests, not payments. If Captains need to take payment directly (pay-at-table), wire `POST /operations/payment` and `POST /operations/closed-order` into Captain's flow.

7. **End-to-end smoke test** — run POS + KDS + Captain simultaneously against a real outlet, place an order, send KOT, verify KDS receives it with correct station tab, bump from KDS, verify POS/Captain reflects it.

---

## 8. Risks and Unresolved Items

### ⚠ High — Table reset race condition (partial mitigation)
POS `handleSettle` now gates the table reset on `backendConfirmed`. However, if the socket event `order:fresh` is received by Captain while POS is mid-payment loop (payments sent but `closed-order` not yet posted), Captain will show the table as free prematurely. Full fix requires backend-side settle acknowledgement rather than client-side socket broadcast.

### ⚠ High — Counter/online order IDs not guarded in Captain
POS guards `if (tableId.startsWith("counter-") || tableId.startsWith("online-"))` in every device bypass handler. Captain app's `handleSelectTable` and `handleAddItem` do not perform this check client-side. If a counter-style tableId ever reaches Captain, it will 404 or throw `TABLE_NOT_FOUND`. Not a problem today (Captain only shows dine-in tables from outlet catalog) but worth adding a defensive check.

### ⚠ Medium — `item.station` defaults to `""` for legacy menu items
Menu items created before station routing was wired will have `station: ""` (not `"Main Kitchen"`). These fall into the `__default__` KOT group on POS and Captain, and display under "All" in KDS (since `ticket.station` is `""` which won't match any named station tab). The `deviceSendKotHandler` sets `station: stationName || "Main Kitchen"` on the KOT object, so KDS will at least see "Main Kitchen" — but only after a KOT is sent. Order items themselves retain `""`. Needs a data migration or a UI fallback label.

### ℹ Low — Debug APKs only
Both distributed APKs are unsigned debug builds. They will install on developer/test devices with USB debugging enabled but cannot be distributed via Play Store or MDM without release signing.

### ℹ Low — `kot-store` is in-memory only
All KOT state lives in a Node.js `Map` — a backend restart clears all active KOTs. The KDS will show an empty board after any server restart. Acceptable for the current stage but needs persistence (Redis or DB) before production.
