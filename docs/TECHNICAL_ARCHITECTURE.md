# Restaurant POS System Technical Architecture

## 1. Overview

This document translates product requirements into an implementation-oriented technical plan for a restaurant POS platform with multi-outlet support, GST compliance, inventory tracking, real-time reporting, and offline-capable billing.

Recommended stack:

- Flutter for POS tablet app and owner mobile app
- React for admin web dashboard
- Node.js with Express for backend APIs
- PostgreSQL for transactional data
- AWS as primary cloud platform
- Firebase Cloud Messaging optionally for mobile push notifications

## 2. High-Level Architecture

### Client applications

- Flutter POS app for tablet billing operations
- Flutter owner app for mobile insights and alerts
- React web app for admin, reports, and outlet management

### Backend services

- REST API service for business operations
- Authentication and authorization layer
- Reporting and analytics layer
- Sync layer for offline data reconciliation
- Integration layer for external platforms and payments

### Data layer

- PostgreSQL for primary operational data
- Redis optional for caching sessions, queues, and short-lived dashboard acceleration
- Object storage optional for invoices, exports, and media assets

## 3. Proposed Backend Modules

### Owner dashboard and configuration

- Business profile management
- Outlet setup
- Category and menu master management
- Discount master configuration
- Role and permission management
- Tax and receipt template management
- Device management and POS linking
- Login and security settings

### Authentication and users

- Login
- Session or token management
- Role and permission management
- Outlet access scoping

### POS

- Order creation
- Order item management
- Table management
- Billing
- Discounts and modifiers
- KOT routing
- Kitchen instructions
- Table move and split bill flows
- Captain and waiter role-limited operations

### Payments

- Cash, UPI, card, and mixed payments
- Payment settlement records
- Refund and reversal support
- Reconciliation hooks

### Inventory

- Stock ledger
- Purchase and stock-in
- Recipe mapping
- Auto deduction
- Waste and adjustments

### Reporting

- Daily sales
- Payment mode summaries
- GST summaries
- Outlet comparisons
- Profitability reports

### Staff

- Staff profile and role mapping
- Attendance
- Shifts
- Activity logs

### Integrations

- Payment gateway integrations
- Swiggy and Zomato sync
- WhatsApp ordering workflows
- Printer and KDS support abstractions
- POS device registration and activation flows

### Notifications and alerts

- Push notifications
- Daily summaries
- Fraud and anomaly alerts

## 4. Suggested Deployment Pattern

### Initial deployment

- Monolithic backend service in Node.js for faster delivery
- PostgreSQL as a single primary database
- React and Flutter clients consuming the same API layer

This is the fastest practical path for Phase 1 and Phase 2.

### Future evolution

- Split background jobs and integrations into separate worker services
- Add event-driven processing for alerts and analytics
- Scale read-heavy reporting through replicas or warehouse sync later if required

## 5. Database Design Guidance

The database should be normalized for transactional integrity, with carefully indexed reporting tables and ledger-style records for critical financial and inventory events.

### Core master tables

- `users`
- `roles`
- `user_roles`
- `permissions`
- `role_permissions`
- `outlets`
- `business_profiles`
- `staff_profiles`
- `customers`
- `menu_categories`
- `menu_items`
- `menu_item_variants`
- `tax_profiles`
- `payment_methods`
- `tables`
- `discount_rules`
- `receipt_templates`
- `device_registry`
- `device_link_tokens`

### Order and billing tables

- `orders`
- `order_items`
- `order_item_modifiers`
- `order_item_instructions`
- `kots`
- `kot_items`
- `payments`
- `payment_splits`
- `invoices`
- `refunds`

### Inventory tables

- `inventory_items`
- `inventory_units`
- `recipes`
- `recipe_items`
- `stock_batches`
- `inventory_transactions`
- `waste_entries`
- `purchase_entries`
- `stock_transfers`

### Finance and reporting support tables

- `expenses`
- `cash_drawer_sessions`
- `attendance_logs`
- `salary_records`
- `audit_logs`
- `alert_events`

### Integration tables

- `external_orders`
- `external_order_events`
- `printer_profiles`
- `sync_queue`

## 6. Essential Table Behaviors

### Orders

- Must store outlet, order type, table or token reference, staff user, tax totals, discount totals, payment status, and sync status

### Payments

- Must support multiple payment rows per order
- Must record payment mode, amount, reference details, status, and settlement metadata

### Inventory transactions

- Must work as an immutable stock ledger where possible
- Transaction types should include stock-in, sale deduction, waste, adjustment, and transfer

### Audit logs

- Must record actor, action, entity type, entity id, timestamp, and metadata

## 7. API Design Principles

- Keep REST APIs predictable and resource-oriented
- Use explicit outlet scoping in every operational request
- Use idempotency keys for payment and order-finalization operations where useful
- Return clear machine-readable status for sync and offline conflict handling

## 8. Recommended API Surface

### Auth

- `POST /api/v1/auth/login`
- `POST /api/v1/auth/logout`
- `GET /api/v1/auth/me`

### Owner dashboard and master settings

- `GET /api/v1/business-profile`
- `PATCH /api/v1/business-profile`
- `GET /api/v1/settings/security`
- `PATCH /api/v1/settings/security`
- `GET /api/v1/settings/tax-profiles`
- `POST /api/v1/settings/tax-profiles`
- `GET /api/v1/settings/receipt-templates`
- `POST /api/v1/settings/receipt-templates`
- `GET /api/v1/settings/discount-rules`
- `POST /api/v1/settings/discount-rules`
- `GET /api/v1/roles`
- `POST /api/v1/roles`
- `GET /api/v1/devices`
- `POST /api/v1/devices/link-token`
- `POST /api/v1/devices/link`
- `PATCH /api/v1/devices/:id/status`

### Outlets

- `GET /api/v1/outlets`
- `GET /api/v1/outlets/:id`

### Menu

- `GET /api/v1/menu`
- `POST /api/v1/menu/items`
- `PATCH /api/v1/menu/items/:id`

### Tables and tokens

- `GET /api/v1/tables`
- `PATCH /api/v1/tables/:id/status`

### Orders

- `POST /api/v1/orders`
- `GET /api/v1/orders/:id`
- `PATCH /api/v1/orders/:id`
- `POST /api/v1/orders/:id/items`
- `POST /api/v1/orders/:id/items/:itemId/instructions`
- `POST /api/v1/orders/:id/send-kot`
- `POST /api/v1/orders/:id/move-table`
- `POST /api/v1/orders/:id/split`
- `POST /api/v1/orders/:id/close`
- `POST /api/v1/orders/:id/cancel`

### Payments

- `POST /api/v1/payments`
- `POST /api/v1/payments/split`
- `POST /api/v1/payments/refund`

### Inventory

- `GET /api/v1/inventory/items`
- `POST /api/v1/inventory/stock-in`
- `POST /api/v1/inventory/waste`
- `POST /api/v1/inventory/adjustments`
- `GET /api/v1/inventory/reports/daily`

### Reports

- `GET /api/v1/reports/daily-sales`
- `GET /api/v1/reports/gst`
- `GET /api/v1/reports/profit`
- `GET /api/v1/reports/payment-summary`
- `GET /api/v1/reports/outlet-comparison`

### Staff

- `GET /api/v1/staff`
- `POST /api/v1/staff/attendance`
- `GET /api/v1/staff/activity`

### Integrations

- `POST /api/v1/integrations/orders/swiggy/webhook`
- `POST /api/v1/integrations/orders/zomato/webhook`
- `POST /api/v1/integrations/whatsapp/order`

## 9. Offline Strategy

### POS client behavior

- Store active menu snapshot locally
- Store pending orders locally
- Allow local bill creation and update
- Queue sync events when internet is unavailable
- Show sync state for each order

### Sync architecture

- Each offline mutation should create a sync event
- Server should apply idempotent reconciliation where possible
- Conflicts should be surfaced to managers instead of silently overwritten

### Local storage options

- Flutter POS app can use SQLite or Drift for robust offline persistence
- Cached menu and settings should be versioned

## 10. Printer and Kitchen Architecture

### Design goals

- Same-network device discovery where supported
- One-tap standard printer setup for common outlets
- Advanced printer profile support for complex kitchens

### Support strategy

- Abstract printing behind a device service in the POS client
- Support receipt printers and kitchen printers separately
- Route KOTs by kitchen section if configured
- Maintain saved printer profiles per device and outlet

### POS linking strategy

- A device should not become an active POS terminal until linked from the owner dashboard or an approved admin flow
- Device linking should assign outlet, printer defaults, receipt template, and permissions scope
- Link flow should support simple code or QR-based onboarding to reduce installation friction

In practice, some printers and operating systems may still require manual fallback setup. The product should treat manual setup as an advanced flow.

## 11. Security and Permissions

### Authentication

- Use token-based auth for clients
- Consider refresh token flow for longer-running sessions

### Authorization

- Enforce role-based permissions on every sensitive API
- Add outlet scoping to prevent cross-outlet data leakage

### Audit coverage

- Discounts
- Deleted bills
- Refunds
- Inventory adjustments
- Expense edits
- Attendance corrections

## 12. Reporting and Analytics Strategy

### Operational reporting

- Query directly from PostgreSQL for Phase 1 and Phase 2
- Add summary tables or materialized views for heavy recurring reports

### Future analytics

- Add event stream or scheduled ETL for richer AI insights
- Build anomaly detection from audit, payments, and inventory data

## 13. Suggested Project Structure

```text
restaurant-platform/
  apps/
    pos_flutter/
    owner_flutter/
    admin_web/
  services/
    api/
  packages/
    shared_types/
    ui_tokens/
  docs/
    PRODUCT_REQUIREMENTS.md
    TECHNICAL_ARCHITECTURE.md
```

## 14. Delivery Plan

### Phase 1 implementation

- Backend auth, business settings, outlets, roles, menu masters, tax setup, receipt templates, devices
- React owner dashboard for setup and administration
- POS device linking flow

### Phase 2 implementation

- Flutter POS app for captain, waiter, and cashier flows
- Orders, tables, kitchen instructions, KOT, payments, invoice basics
- React reporting for daily outlet operations

### Phase 3 implementation

- Inventory, recipes, waste, expenses, staff, audit reports
- Initial fraud and mismatch alerts

### Phase 4 implementation

- Multi-outlet intelligence
- Owner mobile app
- Aggregator integrations
- AI insights and alerts

## 15. Recommended Immediate Build Sequence

1. Finalize owner dashboard permissions and master data schema
2. Define device registration and POS linking flow
3. Define API request and response contracts
4. Scaffold Express backend with module boundaries
5. Build React owner dashboard wireframes
6. Build POS wireframes for captain, waiter, and cashier flows
7. Implement Phase 1 end-to-end
