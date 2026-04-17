# Restaurant POS — Session Context

## Project: DineX / Restaurant OS (Indian POS Platform)

Owner: Amarnath (yathuramarnath-sys)
Repo: yathuramarnath-sys/saisangeet
Working branch: `claude/recover-lost-work-mToW3`

---

## What This Project Is

A full-stack restaurant POS and management platform for Indian restaurants. Built like Square (simple) but with Petpooja-level Indian restaurant depth.

**Stack:**
- Backend: Node.js + Express + socket.io (JSON file store, no PostgreSQL yet)
- Owner Dashboard: React + Vite (port 4173)
- Operations POS: React + Vite (port 4174)
- Waiter Mobile: React + Vite (port 4175)
- Kitchen Display: React + Vite (port 4176)
- Backend API: Express (port 4000)

---

## How to Start Everything

```bash
cd /home/user/saisangeet

# Backend
cd backend && nohup node src/server.js > ../.run/backend.log 2>&1 & cd ..

# Frontend apps
cd apps/owner-web && nohup npm run dev -- --host 0.0.0.0 --port 4173 > ../../.run/owner-web.log 2>&1 & cd ../..
cd apps/operations-pos && nohup npm run dev -- --host 0.0.0.0 --port 4174 > ../../.run/operations-pos.log 2>&1 & cd ../..
cd apps/waiter-mobile && nohup npm run dev -- --host 0.0.0.0 --port 4175 > ../../.run/waiter-mobile.log 2>&1 & cd ../..
cd apps/kitchen-display && nohup npm run dev -- --host 0.0.0.0 --port 4176 > ../../.run/kitchen-display.log 2>&1 & cd ../..
```

Check logs: `tail -5 .run/backend.log .run/owner-web.log`

**On Mac (user's own machine):**
```bash
cd "/Users/amarnath/Documents/New project"
git pull origin claude/recover-lost-work-mToW3
./start-app.sh
```

---

## Login Credentials

| Role | Email | Password |
|------|-------|----------|
| Owner | owner@restaurant.com | owner123 |
| Manager | manager@restaurant.com | manager123 |

Auth uses JSON file store (no PostgreSQL needed).
Data file: `backend/.data/owner-setup.json`

---

## What Is DONE

### Stage 1 — Owner Dashboard (COMPLETE)
- Business Profile (name, GSTIN, contact, address)
- Outlets (create, edit, activate/deactivate)
- Menu & Categories (full CRUD, variants, timing controls)
- Staff & Roles (role creation with permissions, staff management)
- Discount Rules (types, approval limits, conditions)
- Integrations (Swiggy, Zomato, WhatsApp toggles)
- Devices (register POS devices, link to outlet)
- Taxes & Receipts (GST slab config, receipt templates)
- Overview Page (dashboard with summary cards)

### Auth (COMPLETE — Apr 16)
- Real bcrypt password hashing
- Pure JWT auth (8h expiry)
- LoginPage + ProtectedRoute + AuthContext
- Logout route
- `/auth/me` endpoint
- Auth repository rewired to use JSON file store (not PostgreSQL)

### Operations POS (COMPLETE UI — needs backend wiring)
- 3-column layout: Tables (left) | Menu (center) | Order panel (right)
- TableGrid with status colors (Free/Occupied/Bill/Void/Closed)
- Add items, change qty, remove, add notes (less spicy, no onion etc.)
- Send KOT button (only for unsent items)
- Request Bill button
- Payment sheet (Cash / UPI / Card, quick amounts, change calculation)
- Socket.io real-time sync between devices
- Offline fallback to seed data

### Waiter Mobile (COMPLETE — Apr 16)
- TableScreen → OrderScreen → MenuScreen → NoteScreen flow
- Mobile-first large touch targets
- Area tabs, status color chips
- Socket.io real-time sync, JWT auth

### Kitchen Display (COMPLETE — Apr 16)
- FreshKDS-style dark kanban (3 columns)
- KotCard with urgency timer + pulse animation
- Station filter
- Socket.io live KOT updates

---

## What Is PENDING (Not Built Yet)

| Feature | Status | Notes |
|---------|--------|-------|
| Shifts & Cash | Routes exist, no real logic | Open/close shift, cash in/out, mismatch alerts |
| Reports | Routes exist, no data aggregation | Daily sales, GST, payment mode, profit |
| POS billing → backend | UI done, not wired | KOT dispatch, order persistence |
| Table reset after payment | BUG — table stays "Closed" | Need "New Order" / clear table flow |
| GST from tax profile | BUG — hardcoded 5% | Should read from outlet's tax profile |
| Real database | Using JSON file store | PostgreSQL schema exists in docs/ |
| Device linking flow | Not built | QR/code-based POS linking |
| Inventory | Page shell only | Raw material tracking, recipe mapping |
| Multi-outlet comparison | Not built | |
| Owner mobile app | Not built | |

---

## Known Bugs in POS App

1. **Closed tables never reset** — after payment `isClosed=true` but no "New Order" button to clear the table for next customer
2. **GST hardcoded at 5%** — should read from outlet's tax profile set in Owner Dashboard
3. **`buildAreasFromOutlet`** may not map correctly if outlet API returns tables in different shape
4. **No table reset flow** — cashier has no way to free the table after settling

---

## Key File Locations

```
backend/
  src/server.js                    — Express + socket.io server
  src/routes/index.js              — All API routes (/api/v1/...)
  src/data/owner-setup-store.js    — JSON file store (all business data)
  src/modules/auth/                — JWT auth (uses file store, NOT PostgreSQL)
  src/modules/menu/                — Menu CRUD
  src/modules/operations/          — POS orders, KOT
  .data/owner-setup.json           — Live data file

apps/owner-web/src/
  lib/AuthContext.jsx              — JWT auth context
  lib/api.js                       — API client (base: http://localhost:4000/api/v1)
  pages/LoginPage.jsx              — Login screen
  pages/routes.jsx                 — App routes
  features/*/                      — All dashboard pages

apps/operations-pos/src/
  App.jsx                          — Main POS app (3-column layout)
  components/TableGrid.jsx         — Table status grid
  components/MenuPanel.jsx         — Menu browsing
  components/OrderPanel.jsx        — Order + totals + actions
  components/PaymentSheet.jsx      — Payment collection overlay

docs/
  PRODUCT_REQUIREMENTS.md          — Full product spec
  IMPLEMENTATION_SEQUENCE.md       — Build order (Stage 1-6)
  PHASE1_API_CONTRACTS.md          — API contracts
```

---

## Implementation Sequence (from docs)

1. ✅ Owner Dashboard (DONE)
2. ⬜ POS Device Linking
3. ⬜ Captain and Waiter POS Flows (UI done, backend not wired)
4. ⬜ Cashier Billing Completion
5. ⬜ Inventory and Control
6. ⬜ Multi-Outlet Intelligence and Mobile

---

## Session Notes

- Previous session work was on branch `claude/musing-chandrasekhar` — recovered and merged
- Auth repository was rewritten from PostgreSQL to JSON file store on Apr 17
- External tunnel services are blocked in the Claude Code sandbox (localtunnel, cloudflared, serveo all fail)
- User accesses apps by running `./start-app.sh` on their Mac
- PR #1 is open and Vercel deploys marketing site preview from this branch
