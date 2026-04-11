# Restaurant POS Implementation Sequence

## 1. Build Order

The correct product sequence is:

1. Owner Dashboard
2. POS Device Linking
3. Captain and Waiter POS Flows
4. Cashier Billing Completion Flows
5. Inventory and Control Layers
6. Multi-Outlet Intelligence and Mobile Ownership Layer

This sequence ensures the system is configured before outlet staff begin operations.

## 2. Stage 1: Owner Dashboard

This is the first mandatory module.

### Owner dashboard must include

- Business information
- Outlet management
- Category management
- Item management
- Discount settings
- Role management
- User creation
- Reports access
- Master settings
- Login security
- Device management
- Location enablement
- Tax setup
- Receipt templates

### Why this comes first

- POS cannot work correctly before menu, tax, printer, roles, and receipt settings exist
- Device linking depends on outlet and settings configuration
- Permission control must exist before captain and waiter access is assigned

## 3. Stage 2: POS Device Linking

After owner setup, a device should be linked to the system.

### Device linking goals

- Easy installation for POS machine
- Minimal technical steps
- Same-network printer readiness where possible
- Outlet assignment
- Automatic pull of menu, tax, receipt, and permission settings

### Recommended flow

1. Owner creates or approves a POS device token from the dashboard
2. POS app is installed on the terminal
3. Staff enters a code or scans a QR from the owner dashboard
4. Device is linked to an outlet
5. Device syncs menu, tax setup, receipt template, and role rules

## 4. Stage 3: Captain and Waiter POS Access

Captain and waiter users should get limited operational access.

### Required abilities

- Open table
- Add items
- Add kitchen instructions
- Send KOT
- Move table
- Create or request split bill
- Update running orders

### Example kitchen instructions

- Less sugar
- Less spicy
- Extra spicy
- No onion
- No garlic

### Access restrictions

- No access to owner dashboard
- No access to tax settings
- No access to receipt template management
- No access to sensitive security settings
- Discounts and voids only if role allows

## 5. Stage 4: Cashier Billing

After service flow is stable, cashier billing flow should handle:

- Payment collection
- Split payments
- GST invoice
- Print receipt
- Close order

## 6. Stage 5: Control and Intelligence

- Inventory
- Waste
- Fraud alerts
- Expense tracking
- Staff attendance and salary support

## 7. Stage 6: Expansion Layer

- Multi-outlet comparison
- Owner mobile app
- Swiggy and Zomato sync
- WhatsApp and direct ordering
- AI insights
