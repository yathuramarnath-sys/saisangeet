# Restaurant Platform Application Architecture

## 1. Architecture Summary

The platform should follow a shared backend plus multiple client apps model.

### Recommended structure

- `apps/owner-web`
- `apps/operations-pos`
- `apps/waiter-mobile`
- `apps/kitchen-display`
- `backend/`
- `packages/shared-design`
- `packages/shared-types`

## 2. App Responsibilities

### `apps/owner-web`

Recommended stack:

- React

Responsibilities:

- Owner dashboard
- Configuration
- Reporting
- Outlet and business management

### `apps/operations-pos`

Recommended stack:

- Flutter

Responsibilities:

- Counter POS
- Billing
- Payments
- Table management
- Shift cash operations
- KOT print and printer profile operations

### `apps/waiter-mobile`

Recommended stack:

- Flutter

Responsibilities:

- Order taking
- Kitchen instructions
- Table movement
- Running order operations

### `apps/kitchen-display`

Recommended stack:

- Flutter

Responsibilities:

- Live KOT queue
- Station views
- Preparation status

## 3. Shared Backend Architecture

The backend should remain a shared service layer for all apps.

### Backend modules

- auth
- business-profile
- outlets
- menu
- roles and permissions
- orders
- tables
- payments
- shifts and cash control
- devices
- printer profiles
- taxes and receipts
- reports
- integrations

## 4. Shared Package Responsibilities

### `packages/shared-design`

Purpose:

- shared colors
- typography
- spacing rules
- reusable component guidance
- visual consistency across apps

### `packages/shared-types`

Purpose:

- API request and response types
- shared enums
- shared domain models
- permission and role constants

## 5. Client Communication Model

All client apps should talk to the same backend API.

### Core communication patterns

- REST API for standard operations
- optional real-time channel for KOT and live order state
- sync-safe data model for offline-capable clients

## 6. Device and Mode Strategy

### Owner Web

- browser-based access
- responsive but desktop-first

### Operations POS

- installable app
- large touch targets
- offline-first billing support

### Waiter Mobile

- handheld-first
- low-latency order operations
- simplified role-limited screens

### Kitchen Display

- always-on display mode
- large queue UI
- low interaction complexity

## 7. KOT Strategy

The system should support:

- printer-only mode
- display-only mode
- hybrid mode

### Hybrid mode rules

- KOT can route to kitchen printer and kitchen display together
- routing should happen by station where configured
- owner dashboard controls the mode per outlet

## 8. Pricing and Table Strategy

Shared pricing rules:

- area-wise pricing
- order-type pricing
- outlet-aware pricing

Shared table rules:

- area mapping such as AC Hall, Non-AC Hall, Self Service
- variable seat counts
- role-based table creation and movement permissions

## 9. Reporting and Closing Strategy

Reporting should be centralized in owner web, but fed by live operational data from POS and other apps.

### Daily closing report should include

- sales summary
- outlet comparison
- tax summary
- profit snapshot
- cash mismatch alerts
- discount override alerts
- unresolved shift issues

### Delivery mode

- owner email trigger
- manual send
- scheduled send

## 10. Recommended Immediate Build Path

1. Preserve current owner dashboard prototype as visual reference
2. Convert owner dashboard into React app in `apps/owner-web`
3. Expand backend APIs to match owner dashboard modules
4. Define Operations POS screen map
5. Define Waiter Mobile screen map
6. Define Kitchen Display screen map
7. Build shared types and shared design packages
