# Inventory Split Architecture

## Goal

Keep `sales inventory` and `kitchen inventory` separate.

- `Sales inventory` is the only stock used by POS and waiter ordering.
- `Kitchen inventory` is the raw-material and production-side stock used by store, kitchen, waste, and stock issue workflows.
- A sale must never directly reduce kitchen stock.
- Kitchen inventory is a separate optional module for businesses that want deeper production control.

## Domains

### 1. Sales Inventory

Used by:

- POS billing
- Waiter/Captain order taking
- Sales availability checks
- Out-of-stock order blocking
- Opening stock entry before shift
- Mid-shift stock correction

Rules:

- Order completion / billing only deducts `sales inventory`
- POS and waiter app must never read kitchen raw-material balances for ordering decisions
- Sales inventory can be increased by:
  - opening stock
  - manual adjustment
- Sales inventory can be decreased by:
  - sale/KOT consumption
  - spoilage adjustment
  - manual correction

Entry style should stay simple:

- category-wise stock entry
- item-wise stock entry
- usable before shift starts and during live service

### 2. Kitchen Inventory

Used by:

- raw material inward
- store issue
- waste entry
- kitchen production tracking
- stock counting and variance review

Rules:

- Kitchen inventory is independent from POS stock
- Billing must not directly deduct raw material
- Kitchen inventory is optional and should be enabled only if the business wants production control
- Kitchen inventory can be decreased by:
  - waste
  - store issue
  - manual adjustment
- Kitchen inventory can be increased by:
  - purchase inward
  - return/correction
  - manual adjustment

## Database Schema

### Sales inventory tables

- `sales_inventory_items`
  - outlet-specific saleable SKU
  - optional link to `menu_items`
  - reorder and par levels
- `sales_inventory_ledger`
  - immutable stock movement log
  - event types like `opening_stock`, `sale_out`, `adjustment`

### Kitchen inventory tables

- `kitchen_inventory_items`
  - raw material or kitchen production item
  - unit, category, reorder level
- `kitchen_inventory_ledger`
  - immutable movement log
  - event types like `purchase_in`, `waste_out`, `issue_out`, `adjustment`

### Count tables

- `stock_count_sessions`
  - daily/shift count run for either `sales` or `kitchen`
- `stock_count_lines`
  - expected vs counted vs variance

## API Structure

Base path: `/api/v1/inventory`

### Sales inventory APIs

- `GET /sales/items`
  - list current sales inventory balances for POS/waiter visibility
- `GET /sales/items/:itemId`
  - one sales item with recent ledger
- `POST /sales/adjustments`
  - manual correction by manager
- `POST /sales/count-sessions`
  - create count session for sales stock
- `GET /sales/reports/daily-summary`
  - low stock, out of stock, variance

### Kitchen inventory APIs

- `GET /kitchen/items`
  - list raw material balances
- `POST /kitchen/purchases`
  - inward stock entry
- `POST /kitchen/issues`
  - store issue to kitchen/station
- `POST /kitchen/waste`
  - waste entry
- `POST /kitchen/adjustments`
  - manual correction
- `POST /kitchen/count-sessions`
  - create count session for kitchen stock
- `GET /kitchen/reports/daily-summary`
  - inward, issue, waste, critical stock, variance

### Cross-app operational APIs

- `GET /availability/pos`
  - returns sales inventory only
- `GET /availability/waiter`
  - returns sales inventory only
- `POST /events/sale-deduction`
  - called by POS/order workflow
  - updates sales ledger only

## Workflow

### A. Order taking / billing workflow

1. POS or waiter app reads `sales inventory`
2. If sales stock is `0`, ordering is blocked
3. On billing/order completion, system reduces `sales inventory`
4. Kitchen inventory is unchanged by the billing event

### B. Purchase inward workflow

1. Store incharge or manager records inward
2. System updates `kitchen_inventory_ledger`
3. Kitchen stock increases
4. Sales stock is unchanged

### C. Waste workflow

1. Store incharge records waste
2. System updates `kitchen_inventory_ledger`
3. Kitchen stock reduces
4. Owner sees waste in daily report

### D. Daily count / variance workflow

1. Manager or store incharge starts count session
2. Count is done separately for:
  - sales inventory
  - kitchen inventory
3. System records expected vs actual
4. Variance report highlights:
  - missing stock
  - excess stock
  - review-needed items before closing

## Role Access

- `Cashier`
  - read sales inventory only
- `Captain / Waiter`
  - read sales availability only
- `Store Incharge`
  - read/write kitchen inventory
  - create purchase, issue, waste, count
- `Manager`
  - all inventory workflows
  - can approve adjustments
- `Owner`
  - reports, variance, controls, approvals

## Implementation Notes

- Existing mock/demo behavior should be updated so sale deduction affects only sales inventory
- Owner reports should surface sales variance and kitchen variance independently
- Kitchen inventory should remain an optional product module, not a dependency for smooth restaurant billing flow
