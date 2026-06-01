# Saisangeet (Plato) — Claude Context

## What This Is
**Saisangeet** is a multi-tenant SaaS restaurant operations platform branded as **Plato**, live at **dinexpos.in**. It covers POS billing, kitchen display, waiter captain app, online orders (Swiggy/Zomato via UrbanPiper), inventory, cash shifts, and owner analytics.

**Owner**: Amarnath  
**Sentry org**: `dinexpos` at `dinexpos.sentry.io`, project ID `4511308625805392`  
**Backend API**: `https://api.dinexpos.in` (Railway)  
**Owner dashboard**: `https://app.dinexpos.in` (Vercel)

---

## Tech Stack

| Layer | Tech |
|-------|------|
| Backend | Express.js + PostgreSQL (Railway) + Socket.io |
| Frontend | React 19 + Vite (multiple apps) |
| Mobile | Capacitor 8 (Android APK) |
| Desktop | Electron (POS, KDS, Captain) |
| Error monitoring | Sentry `@sentry/node` (backend), `@sentry/react` (frontends) |
| Payments | Razorpay (subscriptions), PhonePe (order payments) |
| Online orders | UrbanPiper (Swiggy/Zomato webhook receiver) |
| Delivery | Borzo |
| Accounting | Zoho |
| Email | Resend |
| SMS/WhatsApp | Twilio, MSG91 |

---

## Monorepo Layout

```
/
├── backend/                   Express API (Railway deployment)
│   └── src/
│       ├── server.js          Entry point — Sentry init must be FIRST
│       ├── app.js             Express app factory, CORS, middleware
│       ├── config/
│       │   ├── sentry.js      Sentry init (SENTRY_DSN env var)
│       │   └── env.js         Environment validation
│       ├── db/
│       │   ├── pool.js        pg pool
│       │   ├── schema.sql     Full schema
│       │   └── migrate.js     Migration runner
│       ├── middleware/        authenticate, requireAuth, requireTenant, error-handler, rate-limit
│       ├── data/              In-memory caches (owner-setup-store, tenant-context AsyncLocalStorage)
│       ├── jobs/              daily-backup, daily-sales-report (cron at IST midnight/11pm)
│       └── modules/           34 domain modules (see below)
│
├── apps/                      Frontend apps (npm workspaces)
│   ├── owner-web/             Owner dashboard → app.dinexpos.in (Vercel)
│   ├── operations-pos/        Cashier POS (Electron + Capacitor APK)
│   ├── waiter-mobile/         Captain/waiter app (Electron + Capacitor APK)
│   ├── kitchen-display/       KDS (Electron + Capacitor APK)
│   ├── tablet-pos/            Tablet POS (Capacitor APK)
│   ├── customer-web/          QR menu + ordering → order.dinexpos.in
│   ├── owner-mobile/          Owner mobile app (Capacitor)
│   └── landing/               Marketing site
│
├── frontend/owner-dashboard/  Alternative frontend workspace (older)
├── packages/                  Shared packages
├── vercel.json                Vercel deploy config (owner-web → app.dinexpos.in)
└── package.json               Root workspace config
```

---

## Backend Modules (34 total)

| Module | Path | Purpose |
|--------|------|---------|
| auth | modules/auth | JWT login/signup, password reset, Google OAuth |
| operations | modules/operations | Orders, KOT, bill requests, table management (core) |
| menu | modules/menu | Menu items, categories, stations, pricing profiles |
| kitchen | modules/kitchen | Kitchen station configuration |
| billing | modules/billing | Razorpay subscriptions, plan management |
| inventory | modules/inventory | Sales + kitchen stock tracking, low-level alerts |
| shifts | modules/shifts | Cash shift open/close, cash movements |
| outlets | modules/outlets | Restaurant branch management |
| users | modules/users | Staff management, roles, RBAC |
| online-orders | modules/online-orders | UrbanPiper webhook, Swiggy/Zomato orders |
| phonepe | modules/phonepe | PhonePe payment webhook |
| borzo | modules/borzo | Borzo delivery webhook |
| zoho | modules/zoho | Zoho accounting sync |
| reports | modules/reports | Sales reports, audit logs |
| settlements | modules/settlements | Daily cash reconciliation |
| devices | modules/devices | POS device registration/pairing |
| customers | modules/customers | Customer profiles |
| advance-orders | modules/advance-orders | Pre-orders/bookings |
| counter | modules/counter | Counter/retail mode sales |
| discounts | modules/discounts | Discount policies |
| tax-profiles | modules/tax-profiles | GST tax rate config |
| receipt-templates | modules/receipt-templates | Printer receipt layouts |
| whatsapp | modules/whatsapp | WhatsApp order notifications |
| business-profile | modules/business-profile | Restaurant branding/info |
| public | modules/public | No-auth QR menu endpoint |
| setup | modules/setup | Initial onboarding |
| clients | modules/clients | Internal Plato admin (multi-tenant management) |
| action-log | modules/action-log | Structured audit trail |
| backup | modules/backup | Backup job management |
| roles | modules/roles | Role definitions |
| permissions | modules/permissions | Permission definitions |

---

## Data Architecture

### Storage Strategy
- **Primary**: PostgreSQL on Railway (`DATABASE_URL`)
- **Fallback**: JSON files in `.data/` directory (Railway persistent volume)
- **Active orders**: In-memory only, persisted to Postgres every 60s via `persistOperationsState()`
- **Tenant config**: `owner-setup-store.js` in-memory cache loaded at startup from Postgres

### Multi-tenancy
- **JWT** contains `tenantId` — set at login
- **AsyncLocalStorage** (`tenant-context.js`) carries tenant through the request lifecycle
- **`requireTenant` middleware** hard-blocks requests without a valid non-default tenantId
- **All data queries must scope by tenantId — never omit this filter**

### Database Tables (key)
- `outlets`, `users`, `roles`, `permissions`, `role_permissions`, `user_roles`
- `menu_items`, `tables`
- `orders`, `order_items`, `order_audit_log`, `order_control_log`, `payments`, `payment_print_log`
- `cash_shifts`, `cash_movements`, `daily_closing`
- `sales_inventory_items`, `sales_inventory_ledger`
- `kitchen_inventory_items`, `kitchen_inventory_ledger`
- `stock_count_sessions`, `stock_count_lines`
- `policy_settings`, `app_runtime_state`, `action_logs`

---

## Real-time (Socket.io)

### Room Naming
- `tenant:{tenantId}` — Owner dashboard + all devices in tenant
- `outlet:{tenantId}:{outletId}` — All devices in one outlet
- `kds:{tenantId}:{outletId}:{stationName}` — Station-specific KDS

### Key Events
| Event | Direction | Purpose |
|-------|-----------|---------|
| `order:update` | POS/Captain → Server | Order mutation |
| `order:updated` | Server → Devices | Sync incoming order |
| `kot:status` | KDS → POS | KOT item completion |
| `item:availability` | POS → All | Sold-out toggle |
| `sync:config` | Server → All | Config change broadcast |
| `online:orders:toggle` | POS → All | Online orders enable/disable |

---

## Auth Flow
1. `POST /api/v1/auth/login` → returns JWT (contains `tenantId`, `userId`, `role`)
2. Client sends `Authorization: Bearer <token>` on all subsequent requests
3. `authenticate` middleware decodes JWT → sets `req.user` + AsyncLocalStorage tenant context
4. `requireTenant` middleware rejects if `tenantId === "default"` or missing

---

## Security Rules
- **All `/api/v1/*` routes** must go through `authenticate` + `requireTenant`
- **Webhook routes** use HMAC-SHA256 signature verification (UrbanPiper, Razorpay, Borzo, PhonePe)
- **`sendDefaultPii: false`** in Sentry config
- **Strip auth headers** in Sentry `beforeSend`
- CORS: strict origin whitelist in both `app.js` and `server.js` (Socket.io)

---

## Deployment

### Backend (Railway)
- Start: `node src/server.js`
- Health: `GET /health` → returns `{ status, db, dbLatencyMs, uptime }`
- Key env vars: `DATABASE_URL`, `JWT_SECRET`, `SENTRY_DSN`, `RESEND_API_KEY`, `RAZORPAY_*`, `MSG91_*`, `TWILIO_*`

### Frontend (Vercel)
- Build: `npm run build` in `apps/owner-web`
- Output: `apps/owner-web/dist`
- SPA routing: all paths → `index.html`
- Env: `VITE_API_BASE_URL=https://api.dinexpos.in/api/v1`

### All subdomains
| Subdomain | App |
|-----------|-----|
| app.dinexpos.in | Owner dashboard |
| api.dinexpos.in | Backend API (Railway) |
| pos.dinexpos.in | POS web fallback |
| captain.dinexpos.in | Captain web fallback |
| kds.dinexpos.in | KDS web fallback |
| order.dinexpos.in | Customer QR ordering |

---

## Common Tasks

### Add a new backend route
1. Create/update module in `backend/src/modules/<module>/`
2. Register in `backend/src/modules/index.js` or `backend/src/routes/index.js`
3. Apply `authenticate` + `requireTenant` + `requirePermission` middleware

### Fix a Sentry error
- Check `backend/src/modules/<module>/` for the failing route
- Check DB queries scope by tenantId
- Check `backend/src/middleware/error-handler.js` for how errors are sent to Sentry

### Add a new frontend page (owner-web)
- Pages live in `apps/owner-web/src/pages/`
- Features in `apps/owner-web/src/features/<feature>/`
- Add route in `apps/owner-web/src/App.jsx`

### Run locally
```bash
# Backend
cd backend && npm run dev   # Node watch mode, port 4000

# Owner web
npm run dev --workspace=apps/owner-web   # Vite, port 5173
```

### Build Windows POS installer (Apple Silicon Mac)
```bash
cd apps/operations-pos
CSC_IDENTITY_AUTO_DISCOVERY=false npm run electron:build:win
# Output: electron-dist/Plato-POS-Setup.exe
```
**IMPORTANT rules for POS builds:**
- NEVER use `ELECTRON_BUILDER_WINE_EXECUTABLE` — wine + signtool corrupts the NSIS uninstaller
- NEVER use `show: false` on the main BrowserWindow — window stays hidden on Windows
- NEVER add `perMachine: true` or `installer.nsh` with nsExec/Sleep in preInit — breaks installer on Windows 11
- NEVER add `ia32` arch — all clients are 64-bit, doubles file size
- After building, copy to Desktop: `cp electron-dist/Plato-POS-Setup.exe ~/Desktop/Plato-POS-Setup-vX.X.XX.exe`
