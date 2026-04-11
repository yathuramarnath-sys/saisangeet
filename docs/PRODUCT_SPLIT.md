# Restaurant Platform Product Split

## 1. Platform Overview

The restaurant system should be built as a multi-app platform, not as one overloaded application.

This product split is required because each user group has very different workflows, device types, and speed expectations.

## 2. Product Applications

### A. Owner Dashboard

Platform:

- Web application

Primary users:

- Owner
- Admin
- Multi-outlet manager
- Accountant

Purpose:

- Business setup and control center
- Multi-outlet visibility
- Reporting, tax, staff, device, and integration administration

Main responsibilities:

- Business profile
- Outlet setup
- Menu and category management
- Staff and role management
- Integrations
- Devices and printer setup
- Taxes and receipt templates
- Shifts and cash control visibility
- Discount rules
- Reports and daily closing report email trigger

### B. Restaurant Operations App

Platform:

- Installable POS application for billing counter devices
- Tablet or desktop-touch style deployment depending on outlet hardware

Primary users:

- Cashier
- Counter operator
- Manager during live operations

Purpose:

- Fast billing and restaurant floor operations

Main responsibilities:

- POS billing
- Tables
- Order management
- Payment collection
- Split bills and split payments
- Shift open and close
- Cash in and cash out
- KOT print routing
- Printer profiles
- Outlet device-level operational settings

### C. Waiter and Captain Mobile App

Platform:

- Mobile-first application

Primary users:

- Waiter
- Captain
- Floor supervisor

Purpose:

- Fast order taking from the floor
- Real-time communication with kitchen and cashier

Main responsibilities:

- Table selection
- Add items
- Add instructions such as low sugar, less spicy, no onion
- Send KOT
- Move table
- Request split bill
- View running order
- Track preparation or serving status if enabled

### D. Kitchen Display App

Platform:

- Tablet or screen-based application for kitchen station use

Primary users:

- Kitchen staff
- Station chefs
- Expo counter

Purpose:

- Replace or complement KOT printers with a live kitchen queue

Main responsibilities:

- Receive KOTs by station
- Show pending and in-progress items
- Mark accepted, preparing, ready, and served
- Filter by kitchen station
- Support hybrid KOT printer + display workflow where needed

## 3. Shared Platform Services

All apps should use the same backend platform and common business rules where possible.

Shared backend responsibilities:

- Authentication
- Role permissions
- Outlet and business configuration
- Orders and payments
- Menu and pricing
- Taxes
- Devices and printer profiles
- Reporting
- Audit logs
- Integrations

## 4. Shared Design and Domain Rules

Shared across all apps:

- Same business entities
- Same menu and pricing rules
- Same role system
- Same outlet model
- Same KOT routing logic
- Same tax rules
- Same audit expectations

Shared package candidates:

- shared design tokens
- shared API types
- shared permission constants
- shared domain enums

## 5. Why This Split Is Correct

### Owner Dashboard should stay separate

- Owners need breadth, analytics, and setup depth
- They do not need a crowded live billing interface

### Operations POS should stay separate

- Billing must be extremely fast and distraction-free
- Cashier workflows should not be mixed with owner-level configuration

### Waiter and Captain app should stay separate

- Mobile usage and floor movement need a simpler interface
- Mobile order-taking is different from cashier billing

### Kitchen Display should stay separate

- Kitchen needs large, glanceable, task-focused status views
- Kitchen workflows should not include billing or owner setup complexity

## 6. Delivery Recommendation

Recommended build order:

1. Owner Dashboard Web
2. Restaurant Operations POS
3. Waiter and Captain Mobile App
4. Kitchen Display App

This order works because the owner dashboard creates the setup needed for all downstream apps.

## 7. Cross-App Dependencies

### Owner Dashboard enables

- outlet creation
- menu and pricing
- role permissions
- taxes
- devices
- integrations

### Operations POS depends on

- menu existing
- outlet existing
- roles existing
- printer or KOT routing existing
- tax profiles existing

### Waiter and Captain app depends on

- tables configured
- menu existing
- outlet permissions existing

### Kitchen Display depends on

- kitchen stations configured
- KOT routing existing
- device setup complete

## 8. Industry-Ready Product Principle

This platform should be designed for use by many restaurants, not just one operator.

That means:

- outlet-agnostic configuration
- reusable role system
- scalable device model
- configurable printer or display workflows
- integration-ready architecture
- consistent audit and reporting model
