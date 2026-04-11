# Restaurant POS System Product Requirements

## 1. Product Summary

Build a restaurant POS and management platform for Indian restaurant operations with support for:

- Fast POS billing
- GST-compliant invoicing
- Inventory deduction and waste tracking
- Multi-outlet monitoring
- Staff access control and attendance
- Real-time reporting
- Owner mobile visibility
- Food aggregator and direct ordering integrations

The product should combine:

- Square-like simplicity, smoothness, and low setup complexity
- Petpooja-like restaurant depth for Indian workflows

Core product principle:

`Any staff should learn in 5 minutes`

## 2. Product Goals

### Primary goals

- Reduce billing time to under 10 seconds for common orders
- Make the system usable by non-technical staff with minimal training
- Provide strong financial visibility for owners across outlets
- Reduce stock leakage and untracked waste
- Support restaurant tax and reporting needs for India

### Secondary goals

- Enable easy multi-outlet expansion
- Improve fraud detection and accountability
- Provide actionable business insights from sales and profit data

## 3. Success Metrics

- New cashier can complete a basic bill within 5 minutes of training
- 90% of common bills can be completed in under 10 seconds
- Order-to-KOT print/display latency under 3 seconds on stable local network
- Daily outlet sales and profit visible in near real time
- Inventory deduction accuracy above 95% when recipes are configured
- Staff can complete core tasks without entering technical settings

## 4. Design Principles

### Usability

- Large touch-friendly controls for tablet-first usage
- Minimal number of steps for frequent actions
- Clear visual hierarchy with low cognitive load
- Simple language and obvious labels
- Smart defaults for setup and operations

### Operational simplicity

- Same-network device setup should be preferred whenever possible
- Avoid exposing IP addresses, ports, or technical network details in normal setup
- Advanced settings should be hidden behind manager/admin access

### Reliability

- Offline-first support for critical billing operations
- Automatic sync when connectivity returns
- Auditability for sensitive financial and inventory events

## 5. User Roles

### Owner

- View all outlets
- Monitor sales, profit, expenses, and alerts
- Access strategic reports
- Configure outlets, taxes, and high-level settings
- Create and manage categories, items, roles, discounts, devices, receipt templates, and security settings

### Manager

- Manage staff, menu, local inventory, and reports
- Approve discounts, voids, and corrections based on permissions
- Monitor outlet operations

### Cashier

- Create orders, accept payments, print bills, and close orders
- Limited visibility into reports and settings

### Kitchen Staff

- View KOTs on kitchen screen or printer
- Update order preparation status if KDS is enabled

### Accountant or Admin

- Access GST and finance reports
- Reconcile cash and bank entries
- Export tax support reports

## 6. Core Modules

## 6.0 Owner Dashboard and Master Control

This module must be the first entry point of the system from an implementation and onboarding perspective.

The system should not assume POS usage begins before owner or admin setup is completed.

### Purpose

- Configure the business before POS rollout
- Centralize all critical master settings
- Control outlet behavior, users, permissions, taxes, devices, and templates

### Owner dashboard scope

- Business information setup
- Outlet creation and outlet settings
- Category creation
- Menu item creation and editing
- Discount creation and approval rules
- User and role management
- Report access
- Master settings
- Login and security settings
- Device management
- Location enablement
- Tax setup
- Receipt template management

### Business information settings

- Business name
- Brand name
- GSTIN
- Contact details
- Address details
- Invoice header and footer details

### Login and security settings

- Password rules
- PIN login rules for POS staff
- Session timeout
- Role-based permission policies
- Sensitive action approval settings

### Device management

- Register POS devices
- Link device to outlet
- Assign default printer profile
- View device status
- Disable lost or inactive devices

### Location enablement

- Activate or deactivate outlets
- Configure outlet operating hours
- Set outlet-specific taxes or receipt rules where applicable

### Tax setup

- GST slab configuration
- Inclusive or exclusive tax rules
- Tax profile assignment to menu items
- Invoice numbering rules

### Receipt template settings

- Business header
- Logo
- Footer notes
- GST fields
- QR payment block
- Dine-in, takeaway, and delivery template variations

### Implementation rule

Owner dashboard should be built before cashier-first POS workflows, because it creates the configuration needed for all downstream operations.

## 6.1 POS Billing System

### Scope

- Dine-in
- Takeaway
- Delivery

### Core features

- Fast product search
- Category-based menu browsing
- Favorites or quick action items
- Table selection and table status view
- Quantity edits, modifiers, and notes
- Bill hold and resume
- Split bill and split payment support
- Payment modes: cash, UPI, card, mixed
- GST auto-calculation
- Receipt and invoice printing
- KOT generation for kitchen printer or kitchen display
- Kitchen instructions such as low sugar, less spicy, no onion, extra spicy
- Move table support
- Table creation and management support

### UX requirements

- Common actions must be reachable within one or two taps
- Buttons must be large enough for tablet use in busy environments
- Touch targets should support fast operation with one hand
- The bill screen must clearly show items, quantity, discounts, taxes, and total
- Errors should be recoverable without losing the order

### Performance requirements

- Common bill completion target under 10 seconds
- Menu search should feel instant for typical outlet menu size
- KOT dispatch should occur immediately after order confirmation

### Functional flows

- Dine-in: select table -> add items -> send KOT -> payment -> bill print
- Takeaway: add customer or token -> add items -> payment -> bill print
- Delivery: choose source -> assign order details -> send KOT -> payment or pending settlement

### Captain and waiter workflow

- Staff with limited POS access should be able to create or update running orders
- They should be able to add item-level or order-level kitchen instructions
- They should be able to move orders between tables with proper tracking
- They should be able to request split bill flow
- They should not access owner-only settings, tax setup, or sensitive financial controls unless permitted

## 6.2 Smart Inventory

### Core features

- Raw material stock tracking
- Unit and pack-based inventory handling
- Recipe mapping from menu item to ingredients
- Automatic stock deduction when items are sold
- Daily stock summary
- Manual stock adjustment with reason
- Waste or spoilage entry
- Purchase and stock intake tracking
- Low-stock alerts
- Missing stock alerts based on expected vs actual usage

### Key business value

- Detect leakage, wastage, and unrecorded consumption
- Improve food-cost control
- Support outlet-level accountability

### Example alerts

- "Today 5kg rice missing"
- "Chicken consumption is above expected level"
- "Oil stock below reorder threshold"

## 6.3 Multi-Outlet Control

### Core features

- One dashboard for all outlets
- Outlet-wise sales, profit, expenses, and tax summary
- Outlet comparison by date range
- Outlet ranking and trend views
- Shared master menu with outlet-level overrides if needed
- Centralized monitoring of operational alerts

### Example insights

- "Shop 2 profit down 18% today"
- "Outlet 4 has the highest food cost this week"

## 6.4 Staff Management

### Core features

- Staff profile management
- Role-based access control
- Attendance via manual entry or biometric integration later
- Shift assignment
- Salary and payroll support data
- Sensitive action tracking for discounts, deletions, voids, and overrides

### Sensitive actions requiring audit

- Unauthorized discount attempts
- Deleted bills
- Void orders
- Inventory adjustments
- Cash drawer mismatches

## 6.5 Reports and Tax

### Core reports

- Daily sales report
- Outlet-wise performance report
- GST report
- Payment mode report
- Expense report
- Profit report
- Cash vs bank reconciliation report
- Staff activity report
- Inventory consumption and waste report

### Tax support outputs

- GST-ready summary report
- Invoice register
- Sales summary by tax slab
- Expense support for financial filing
- IT return support report

### Alerting

- Cash vs bank mismatch detection
- Unusual discounting patterns
- Bill deletion spikes

## 6.6 Owner Mobile App

### Core features

- Live sales overview
- Outlet-wise sales snapshot
- Daily summary notification
- Alert notifications
- Quick access to profit and expense summaries

### Example notifications

- "Today total sales: Rs 2,45,000"
- "Cash mismatch detected at Outlet 2"
- "Sales dropped 14% compared to yesterday"

## 6.7 Online Integration

### Core features

- Swiggy and Zomato order sync
- Direct ordering website support
- WhatsApp ordering support
- Unified order flow into POS and kitchen

### Business goal

- Reduce missed orders
- Reduce dependency on high-commission channels over time

## 7. Advanced Differentiators

## 7.1 AI Insights

- Top profit item today
- Best-selling time window
- Sales drop alerts
- Slow-moving items
- Outlet anomaly detection

These insights should be explainable and based on visible operational data.

## 7.2 Fraud and Loss Control

- Cash mismatch alerts
- Unauthorized discount tracking
- Deleted bill tracking
- Void order tracking
- Unusual inventory adjustment tracking

## 7.3 Profit Intelligence

- Profit per item
- Profit per order
- Profit per outlet
- Daily expense vs income
- Food cost trend analysis

## 8. Printer and Device Experience

This is a strategic usability requirement.

### Required behavior

- Prefer same-network discovery for supported printers and local devices
- Avoid requiring manual IP configuration in common setups
- Provide one-click default printer setup for standard cases
- Auto-save printer preferences where possible
- Support advanced printer routing only when needed

### POS device linking

- Owner or manager should generate or approve a device-linking flow from the dashboard
- A POS machine should be installable and linkable to an outlet through a simple code, token, QR flow, or admin approval flow
- Once linked, the POS machine should automatically pull outlet menu, taxes, receipt settings, and user rules
- Device setup should minimize technical actions during installation

### Advanced routing support

- KOT by kitchen section or prep station
- Separate receipt and kitchen printers
- Printer profiles for complex outlet layouts

The product should keep advanced printing complexity away from normal staff workflows.

## 9. Offline Support

### Offline-critical functions

- Create order
- Edit order
- Save bill locally
- Print local bill or KOT where architecture allows
- Accept payment with appropriate offline handling rules

### Sync expectations

- Automatic sync when internet returns
- Conflict detection and resolution rules
- Clear sync status visibility for manager/admin users

### Offline risk rules

- Certain actions, such as online order sync or cloud reconciliation, may be delayed
- System must prevent silent data loss

## 10. Non-Functional Requirements

### Performance

- Billing interactions must be low latency
- Reports should load quickly for common date ranges
- Dashboard refresh should support near real-time visibility

### Security

- Role-based access control
- Secure authentication
- Audit logs for sensitive actions
- Encrypted transport for APIs

### Scalability

- Support multiple outlets from the same platform instance
- Support growing menu, order, and report volumes

### Maintainability

- Modular backend architecture
- Clear separation between POS, inventory, reports, and integrations

## 11. Open Functional Decisions

These items should be finalized before implementation is locked:

- Table merge and split behavior
- Refund and cancellation workflow
- Discount approval rules
- Recipe versioning and ingredient substitutions
- Staff biometric device integration method
- Printer hardware compatibility list
- KDS vs printer strategy for kitchen operations
- Swiggy and Zomato integration model
- WhatsApp ordering scope
- Exact GST invoice format and export requirements

## 12. Release Phases

### Phase 1

- Owner dashboard
- Business setup
- Outlet setup
- Role and user setup
- Menu categories and items
- Tax setup
- Receipt templates
- Device management and POS linking

### Phase 2

- POS billing
- Menu and categories
- Tables and order flow
- KOT
- Payment collection
- GST invoice generation
- Basic daily reporting

### Phase 3

- Inventory
- Recipe mapping
- Waste tracking
- Expense tracking
- Fraud and mismatch reports
- Staff management basics

### Phase 4

- Multi-outlet dashboard
- Owner mobile app
- Aggregator integrations
- Direct ordering
- AI insights and anomaly alerts

## 13. Recommended Immediate Next Steps

1. Finalize system architecture and technical stack decisions
2. Define owner dashboard schema and permission model
3. Define POS device linking flow
4. Define complete PostgreSQL schema
5. Define API contracts
6. Create wireframes for owner dashboard and POS
7. Scaffold backend and web/mobile apps
