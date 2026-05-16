# Pre-Launch Checklist
**Last reviewed: 2026-05-11**
Status legend: ⬜ Not started · 🔄 In progress · ✅ Done

---

## 🔴 BLOCKERS — Must fix before any real customer

### 1. ✅ Persist active orders to database
**Fixed: 2026-05-11**
**Files changed:** `backend/src/modules/operations/operations.state.js`

Two-layer fix:
- **Postgres path** (production): The `runWrite()` → `persistOperationsState()` → `saveRuntimeState()` chain was already in place. Requires `ENABLE_DATABASE=true` set as a Railway environment variable. Set this now if not already done.
- **JSON file fallback** (no DB / dev): `persistOperationsState()` now writes `backend/.data/active-orders-{tenantId}.json` on every mutation. On startup, `syncOperationsState()` reads this file once per tenant and hydrates the memory store. Protects against process crashes and container restarts. Lost only on a fresh Railway deploy (acceptable — that's intentional).

**Action still needed:** Confirm `ENABLE_DATABASE=true` is set in Railway dashboard for full durability.

---

### 2. ✅ Offline mode for POS
**Fixed: 2026-05-11**
**Files changed:** `apps/operations-pos/src/App.jsx`

- Existing offline banner, KOT queue, and auto-flush were already in place.
- **Gap closed:** Added `CLOSED_QUEUE_KEY` (`pos_closed_order_queue`) — when `POST /operations/closed-order` fails offline, the closed order is queued in localStorage instead of being silently dropped.
- Queue flushed automatically on `window "online"` event alongside the KOT queue via `flushClosedOrderQueue()`.
- Offline banner updated to show both queued KOTs and queued bills: `"📡 Offline — 2 KOTs & 1 bill queued, will sync when connection returns."`.
- Staff can take orders, send KOTs, settle bills, and print receipts fully offline. Everything syncs when internet returns.

---

### 3. ✅ Bill reprint button
**Fixed: 2026-05-11**
**Files changed:** `apps/operations-pos/src/components/PastOrdersModal.jsx`, `apps/operations-pos/src/components/OrderPanel.jsx`, `apps/operations-pos/src/App.jsx`

- `PastOrdersModal` already had a "🖨 Reprint Bill" button — but it was using a browser pop-up with **hardcoded 5% GST**, not the real thermal printer.
- **Fixed:** Replaced local `printBill` function with import of `../lib/printBill` (the real ESC/POS thermal path).
- `outletName` and `cashierName` props added to `<PastOrdersModal>` in App.jsx so reprints print the correct outlet name and cashier.
- Printer error events (`dinex:print-error`) already toast to the cashier — no extra work needed.
- **Also fixed:** `getFinancials()` in `OrderPanel.jsx` was hardcoding `taxRate = 0.05`. Now uses per-item tax matching `printBill.js` and `handleSettle` exactly.
- "GST 5%" hardcoded label in expanded order view changed to just "GST".

---

### 4. ✅ Audit & fix menu item tax rates
**Fixed: 2026-05-11**
**Files changed:** `apps/owner-web/src/features/menu/MenuPage.jsx`, `apps/owner-web/src/styles/app.css`

- `missingTaxCount` metric already existed in the dashboard — made it **clickable** to filter items list to only those missing a GST rate.
- Added `taxFilter` state wired into `filteredLibraryItems`.
- **Warning banner** shown above the items table when any items have no GST rate set: orange banner with count + "Click to view & fix" / "Show all items" toggle.
- **Per-row `⚠️ GST` badge** on each item missing a taxRate — visible at a glance without having to click anything.
- CSS added: `.tax-audit-banner`, `.tax-missing-badge`, `.metric-card-clickable`.

---

## 🟡 IMPORTANT — Fix before scaling beyond 1 outlet

### 5. ⬜ Android keystore uninstall warning
**Status:** New keystores generated 2026-05-10 (originals were lost).
**Impact:** Devices running Captain v1.4 or KDS v1.3 need manual uninstall before installing new APKs. Android rejects upgrades with mismatched signatures.
**Action:** Before rolling out Captain v1.5 / KDS v1.4, physically uninstall old APK on every device first.
**Files:** `backend/keystores/KEYSTORE_INFO.md` — credentials and instructions saved here.

---

### 6. ⬜ Concurrent order edit race condition
**Files:** `apps/operations-pos/src/App.jsx`, `apps/waiter-mobile/src/App.jsx`
**Problem:** If POS cashier and Captain waiter both edit the same table simultaneously, the last socket event wins. Items can silently disappear from orders.
**Fix:** Add a `updatedAt` timestamp to every order. On `order:update` receive, only apply if incoming `updatedAt` is newer than local. Reject and toast "Order was updated on another device — please refresh" if stale.

---

### 7. ⬜ Printer-offline detection for bill printing
**File:** `apps/operations-pos/src/lib/printBill.js`, `apps/operations-pos/electron/main.js`
**Problem:** If thermal printer is off or out of paper, `printBill()` silently fails. Cashier sees no error. Customer gets no receipt.
**Note:** `dinex:print-error` event IS already fired and toasted. The gap is there's no retry button in the toast — cashier must open Past Orders → Reprint manually (now possible after Blocker 3 fix).

---

### 8. ⬜ Manager PIN server-side validation
**File:** `apps/operations-pos/src/components/ShiftModals.jsx`
**Problem:** Manager PIN lives in `localStorage`. Anyone with physical access to the device can open DevTools and read or change it.
**Fix:** Store PIN as a bcrypt hash server-side (per outlet). Validate via `POST /operations/verify-pin`. Keep localStorage as fallback cache only.

---

### 9. ⬜ app-versions.json Railway volume
**File:** `backend/.data/app-versions.json`
**Problem:** If Railway recycles the container without a persistent volume, `.data/` resets and version info is lost. Update banners stop working.
**Fix:** Confirm Railway has a persistent volume mounted at `/app/.data`. If not, move version config to Postgres or an environment variable.

---

### 10. ⬜ Dashboard socket auth expiry
**File:** `apps/owner-web/src/features/dashboard/DashboardPage.jsx`
**Problem:** When `pos_token` JWT expires, the socket auth fails silently. Dashboard falls back to 15s polling with no user feedback.
**Fix:** On socket `connect_error`, check if it's an auth error and show a small "⚠️ Live updates paused — please refresh" chip in the toolbar.

---

## ✅ Already Fixed (this session + previous session)

| # | What | Files |
|---|------|-------|
| ✅ | Per-item GST calculation (was hardcoded 5%) | `printBill.js`, `App.jsx`, `OrderPanel.jsx` |
| ✅ | Bill prints AFTER server assigns billNo | `App.jsx` handleSettle |
| ✅ | KOT "Both (KOT + Bill)" printers now included | `kotPrint.js` |
| ✅ | KDS auto-bump checked wrong status (`ready` → `preparing`) | `kds/App.jsx` |
| ✅ | KDS single-column default (was 2 columns) | `kds/App.jsx`, `app.css` |
| ✅ | `--kds-cols` CSS variable was ignored by grid | `kds/app.css` |
| ✅ | `sync:config` was broadcast to ALL tenants | `server.js`, controllers |
| ✅ | Manager PIN hardcoded "1234" in source | `ShiftModals.jsx` |
| ✅ | Security tab to change PIN | `PosSettingsModal.jsx` |
| ✅ | Electron preload listener memory leaks | `preload.js`, `UpdateBanner.jsx` |
| ✅ | TCP double-resolve guard in main.js | `electron/main.js` |
| ✅ | KOT queue discarded even on failed server response | `App.jsx` |
| ✅ | Bill total in payment modal used hardcoded 1.05 | `App.jsx` |
| ✅ | Owner dashboard polling 60s → 15s + socket push | `DashboardPage.jsx`, `server.js` |
| ✅ | app-versions.json used require() cache (stale reads) | `routes/index.js` |
| ✅ | Captain/KDS version numbers in app-versions.json wrong | `.data/app-versions.json` |
| ✅ | Keystores lost — regenerated and saved to backend | `backend/keystores/` |
| ✅ | Bill reprint uses browser popup instead of thermal printer | `PastOrdersModal.jsx` |
| ✅ | `getFinancials()` hardcoded 5% tax | `OrderPanel.jsx` |
| ✅ | Menu page: no visual flag on items missing GST rate | `MenuPage.jsx`, `app.css` |
| ✅ | Active orders: JSON file fallback when DB not enabled | `operations.state.js` |
| ✅ | Settled bills silently dropped when offline | `App.jsx` (closed-order queue) |

---

## Build Versions at Last Release

| App | Version | Built | File |
|-----|---------|-------|------|
| POS | 1.3.4 | 2026-05-10 | `Plato-POS-Setup-v1.3.4.exe` |
| Captain | 1.5 (code 6) | 2026-05-10 | `Plato-Captain-v1.5.apk` |
| KDS | 1.4 (code 5) | 2026-05-10 | `Plato-KDS-v1.4.apk` |
| Owner Web | 0.1.0 | 2026-05-10 | Deployed via Vercel |
| Backend | — | 2026-05-11 | Deployed via Railway |

Release folder: `backend/keystores/releases/` and `~/Desktop/APKS/Plato-Release-v1/`

---

## One Action Needed on Railway Right Now

> **Set `ENABLE_DATABASE=true`** in your Railway service environment variables.
> This activates Postgres persistence for active orders — the most important production safeguard.
> Without it, the JSON file fallback is active (protects against crashes but not fresh deploys).
