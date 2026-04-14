# Inventory Modules API Design

## Product Direction

Inventory should be designed as two independent modules.

### 1. Sales Inventory

- stock for sellable items
- checked by POS and waiter/captain app only
- deduction happens only on billing or order completion
- this module can be enabled optionally for customers who want sellable-stock control

### 2. Kitchen Inventory

- raw materials and kitchen-side production stock
- waste entry
- store issue
- kitchen consumption
- fully independent from billing stock
- this should be treated as a separate optional product add-on for the future

## Important Rule

There must be **no automatic sync** from kitchen inventory to sales inventory.

- sale must not reduce kitchen stock
- kitchen raw-material movement must not auto-update sales stock
- sales inventory and kitchen inventory should run independently

If a customer uses only billing flow, restaurant operations should still run smoothly without kitchen inventory enabled.

## Module 1: Sales Inventory

### Purpose

- tell POS whether an item can be sold
- tell waiter/captain mobile whether an item can be ordered
- support low-stock and out-of-stock checks
- support simple stock entry before shift and during service

### Main tables

- `sales_inventory_items`
- `sales_inventory_ledger`
- `sales_stock_counts`

### Recommended fields

`sales_inventory_items`

- `id`
- `outlet_id`
- `menu_item_id`
- `sku_code`
- `item_name`
- `unit_label`
- `current_qty`
- `reorder_level`
- `par_level`
- `is_active`
- `created_at`
- `updated_at`

### Ledger event types

- `opening_stock`
- `manual_adjustment_in`
- `manual_adjustment_out`
- `sale_out`
- `spoilage_out`
- `count_variance`

### Rules

- POS reads only this inventory
- waiter/captain app reads only this inventory
- item blocking is based only on this inventory
- deduction happens only after billing/order completion
- stock can be entered in two easy ways:
  - category-wise quick entry
  - item-wise direct entry
- stock entry should work:
  - before cashier starts the shift
  - during service if manager or cashier updates available quantity

### Recommended UI flow

Keep this module simple like a quick item library workflow:

- search item
- filter by category
- update available quantity fast
- allow batch update before shift
- allow one-item correction during live service

Recommended entry modes:

1. `Category-wise opening stock`
   - cashier/manager selects category
   - enters quantity for visible items quickly

2. `Item-wise stock update`
   - cashier/manager opens one item
   - updates available sellable quantity

3. `Mid-shift correction`
   - fast item search
   - update quantity without leaving billing flow for too long

## Module 2: Kitchen Inventory

### Purpose

- manage raw materials
- manage kitchen-side stock
- record waste
- record store issue
- record kitchen consumption

### Main tables

- `kitchen_inventory_items`
- `kitchen_inventory_ledger`
- `kitchen_waste_entries`
- `kitchen_issue_entries`
- `kitchen_stock_counts`

### Recommended fields

`kitchen_inventory_items`

- `id`
- `outlet_id`
- `item_code`
- `item_name`
- `category_name`
- `unit_label`
- `current_qty`
- `reorder_level`
- `is_active`
- `created_at`
- `updated_at`

### Ledger event types

- `purchase_in`
- `return_in`
- `issue_out`
- `waste_out`
- `production_consumption_out`
- `manual_adjustment_in`
- `manual_adjustment_out`
- `count_variance`

### Rules

- store incharge and manager use this module
- no billing availability checks from this module
- no order blocking from this module
- no stock sync into sales inventory

## API Structure

Base path:

`/api/v1/inventory`

## Sales Inventory APIs

### GET `/api/v1/inventory/sales/items`

Use:

- POS startup
- waiter/captain menu availability
- opening stock screen
- live item-wise stock correction

Response:

```json
[
  {
    "id": "uuid",
    "menuItemId": "uuid",
    "name": "Paneer Tikka",
    "unitLabel": "portion",
    "currentQty": 18,
    "reorderLevel": 5,
    "status": "available"
  }
]
```

### GET `/api/v1/inventory/sales/items/:id`

Use:

- detailed item balance and recent ledger

### POST `/api/v1/inventory/sales/adjustments`

Use:

- manager correction for sellable stock

Request modes:

- `opening_stock`
- `category_batch_update`
- `item_update`
- `mid_shift_correction`

### POST `/api/v1/inventory/sales/deductions`

Use:

- only after order completion / bill completion

Request:

```json
{
  "orderId": "uuid",
  "orderNumber": 10031,
  "lines": [
    {
      "salesInventoryItemId": "uuid",
      "quantity": 2
    }
  ],
  "actorName": "Cashier Anita",
  "actorRole": "cashier"
}
```

## Kitchen Inventory APIs

### GET `/api/v1/inventory/kitchen/items`

Use:

- raw-material list for store incharge and manager

### POST `/api/v1/inventory/kitchen/purchases`

Use:

- inward stock entry

### POST `/api/v1/inventory/kitchen/issues`

Use:

- store issue

### POST `/api/v1/inventory/kitchen/waste`

Use:

- waste entry

### POST `/api/v1/inventory/kitchen/consumption`

Use:

- kitchen-side consumption logging

### POST `/api/v1/inventory/kitchen/adjustments`

Use:

- manager corrections

## Workflow

### Sales inventory workflow

1. before shift, cashier or manager can enter stock category-wise or item-wise
2. POS or waiter app checks `sales inventory`
3. if item quantity is `0`, item is blocked
4. during service, cashier or manager can update stock again if needed
5. when order is completed, system deducts sales stock
6. kitchen inventory is not touched

### Kitchen inventory workflow

1. store incharge records inward, issue, waste, or kitchen consumption
2. system updates kitchen ledger
3. this does not affect billing stock

## Reporting

### Sales inventory reports

- low stock
- out of stock
- sold quantity
- sales-side variance

### Kitchen inventory reports

- inward stock
- issue stock
- waste
- kitchen consumption
- kitchen-side variance

## Recommended Product Rollout

### Current core product

- keep restaurant billing smooth
- POS and waiter apps run without kitchen inventory dependency
- sales inventory can be enabled if the customer wants stock checks

### Future optional add-on

- kitchen inventory
- store incharge workflows
- raw material control
- waste and kitchen consumption visibility
