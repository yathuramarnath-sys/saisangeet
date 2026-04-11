# Restaurant POS Phase 1 API Contracts

## 1. Scope

These API contracts cover Phase 1 implementation:

- Authentication
- Outlets
- Menu
- Tables
- Orders
- KOT dispatch
- Payments
- Invoice generation
- Daily operational reporting

Base path:

`/api/v1`

Response format:

- JSON
- Timestamps in ISO 8601
- Currency values as decimal numbers with two fractional digits

## 2. Auth APIs

### POST `/api/v1/auth/login`

Use for cashier, manager, owner, and admin login.

Request:

```json
{
  "identifier": "cashier@example.com",
  "password": "secret"
}
```

Response:

```json
{
  "token": "jwt-or-session-token",
  "refreshToken": "refresh-token",
  "user": {
    "id": "uuid",
    "fullName": "Asha Sharma",
    "outletId": "uuid",
    "roles": ["cashier"]
  }
}
```

### GET `/api/v1/auth/me`

Response:

```json
{
  "id": "uuid",
  "fullName": "Asha Sharma",
  "outletId": "uuid",
  "roles": ["cashier"],
  "status": "active"
}
```

## 3. Outlet APIs

### GET `/api/v1/outlets`

Response:

```json
[
  {
    "id": "uuid",
    "code": "BLR-01",
    "name": "Bangalore Indiranagar",
    "gstin": "29ABCDE1234F1Z5",
    "isActive": true
  }
]
```

## 4. Menu APIs

### GET `/api/v1/menu?outletId=:outletId`

Purpose:

- Load category and item data for POS startup
- Cache for offline usage

Response:

```json
{
  "categories": [
    {
      "id": "uuid",
      "name": "Starters",
      "sortOrder": 1
    }
  ],
  "items": [
    {
      "id": "uuid",
      "categoryId": "uuid",
      "name": "Paneer Tikka",
      "basePrice": 220.0,
      "taxProfile": {
        "name": "GST 5%",
        "cgstRate": 2.5,
        "sgstRate": 2.5,
        "igstRate": 0
      },
      "isAvailable": true,
      "isFavorite": true,
      "kitchenStation": "grill"
    }
  ],
  "version": "2026-04-10T12:00:00Z"
}
```

### POST `/api/v1/menu/items`

Permissions:

- `manager`
- `owner`

Request:

```json
{
  "outletId": "uuid",
  "categoryId": "uuid",
  "taxProfileId": "uuid",
  "name": "Veg Fried Rice",
  "basePrice": 180.0,
  "isVeg": true,
  "isFavorite": false,
  "kitchenStation": "main"
}
```

## 5. Table APIs

### GET `/api/v1/tables?outletId=:outletId`

Response:

```json
[
  {
    "id": "uuid",
    "tableNumber": "T1",
    "areaName": "Ground Floor",
    "capacity": 4,
    "status": "available"
  }
]
```

### PATCH `/api/v1/tables/:id/status`

Request:

```json
{
  "status": "occupied"
}
```

## 6. Order APIs

### POST `/api/v1/orders`

Purpose:

- Create a new order for dine-in, takeaway, or delivery

Request:

```json
{
  "outletId": "uuid",
  "orderType": "dine_in",
  "tableId": "uuid",
  "customerName": "Rahul",
  "customerPhone": "9999999999",
  "guestCount": 3,
  "notes": "Less spicy"
}
```

Response:

```json
{
  "id": "uuid",
  "orderNumber": 10024,
  "status": "draft",
  "paymentStatus": "pending",
  "totals": {
    "subtotalAmount": 0,
    "discountAmount": 0,
    "taxAmount": 0,
    "roundOffAmount": 0,
    "totalAmount": 0
  }
}
```

### GET `/api/v1/orders/:id`

Response:

```json
{
  "id": "uuid",
  "outletId": "uuid",
  "orderNumber": 10024,
  "orderType": "dine_in",
  "status": "draft",
  "paymentStatus": "pending",
  "table": {
    "id": "uuid",
    "tableNumber": "T4"
  },
  "items": [],
  "totals": {
    "subtotalAmount": 0,
    "discountAmount": 0,
    "taxAmount": 0,
    "roundOffAmount": 0,
    "totalAmount": 0
  }
}
```

### POST `/api/v1/orders/:id/items`

Purpose:

- Add one or more items to an order
- Server recalculates totals

Request:

```json
{
  "items": [
    {
      "menuItemId": "uuid",
      "quantity": 2,
      "notes": "Extra chutney"
    },
    {
      "menuItemId": "uuid",
      "quantity": 1
    }
  ]
}
```

Response:

```json
{
  "orderId": "uuid",
  "status": "draft",
  "items": [
    {
      "id": "uuid",
      "itemName": "Paneer Tikka",
      "quantity": 2,
      "unitPrice": 220.0,
      "taxAmount": 22.0,
      "lineTotal": 462.0
    }
  ],
  "totals": {
    "subtotalAmount": 440.0,
    "discountAmount": 0,
    "taxAmount": 22.0,
    "roundOffAmount": 0,
    "totalAmount": 462.0
  }
}
```

### PATCH `/api/v1/orders/:id`

Use for:

- Update customer details
- Update notes
- Apply order-level discount

Request:

```json
{
  "customerName": "Rahul Kumar",
  "notes": "No onion",
  "discountAmount": 25.0
}
```

### POST `/api/v1/orders/:id/send-kot`

Purpose:

- Generate one or more KOT records for unsent order items
- Route by kitchen station when configured

Response:

```json
{
  "orderId": "uuid",
  "status": "kot_sent",
  "kots": [
    {
      "id": "uuid",
      "kotNumber": 2104,
      "kitchenStation": "grill",
      "status": "pending"
    }
  ]
}
```

### POST `/api/v1/orders/:id/close`

Purpose:

- Mark order as completed after successful payment
- Generate invoice if not already created

Response:

```json
{
  "orderId": "uuid",
  "status": "completed",
  "paymentStatus": "paid",
  "invoiceId": "uuid"
}
```

## 7. Payment APIs

### POST `/api/v1/payments`

Purpose:

- Record full or partial payment
- Support split payments across methods

Request:

```json
{
  "outletId": "uuid",
  "orderId": "uuid",
  "payments": [
    {
      "methodType": "cash",
      "amount": 300.0
    },
    {
      "methodType": "upi",
      "amount": 162.0,
      "referenceNumber": "UPI-TRX-1009",
      "providerName": "PhonePe"
    }
  ]
}
```

Response:

```json
{
  "orderId": "uuid",
  "paymentStatus": "paid",
  "paidAmount": 462.0,
  "remainingAmount": 0.0,
  "payments": [
    {
      "id": "uuid",
      "methodType": "cash",
      "amount": 300.0,
      "status": "paid"
    },
    {
      "id": "uuid",
      "methodType": "upi",
      "amount": 162.0,
      "status": "paid"
    }
  ]
}
```

## 8. Invoice APIs

### GET `/api/v1/orders/:id/invoice`

Response:

```json
{
  "id": "uuid",
  "invoiceNumber": "INV-BLR01-2026-000245",
  "invoiceDate": "2026-04-10T12:15:00Z",
  "billingName": "Rahul Kumar",
  "totals": {
    "subtotalAmount": 440.0,
    "discountAmount": 0,
    "cgstAmount": 11.0,
    "sgstAmount": 11.0,
    "igstAmount": 0,
    "cessAmount": 0,
    "roundOffAmount": 0,
    "totalAmount": 462.0
  }
}
```

## 9. Reporting APIs

### GET `/api/v1/reports/daily-sales?outletId=:outletId&date=2026-04-10`

Response:

```json
{
  "outletId": "uuid",
  "date": "2026-04-10",
  "orderCount": 184,
  "grossSales": 86540.0,
  "discountAmount": 2480.0,
  "taxAmount": 4121.0,
  "netSales": 88181.0,
  "paymentSummary": {
    "cash": 24200.0,
    "upi": 44100.0,
    "card": 19881.0
  }
}
```

## 10. Error Contract

All error responses should follow:

```json
{
  "error": {
    "code": "ORDER_NOT_FOUND",
    "message": "Order does not exist",
    "details": {}
  }
}
```

Recommended common error codes:

- `AUTH_INVALID_CREDENTIALS`
- `AUTH_FORBIDDEN`
- `OUTLET_NOT_FOUND`
- `MENU_ITEM_NOT_FOUND`
- `ORDER_NOT_FOUND`
- `ORDER_ALREADY_COMPLETED`
- `PAYMENT_AMOUNT_INVALID`
- `INSUFFICIENT_PERMISSION`
- `TABLE_NOT_AVAILABLE`

## 11. Phase 1 Validation Rules

- Order must belong to the authenticated user's outlet unless the role allows broader scope
- `dine_in` orders should include a valid table unless explicitly configured otherwise
- Payment total cannot exceed allowed operational limits without manager approval
- Completed orders should be immutable except through authorized refund or cancellation flow
- KOT generation should only include unsent items

## 12. Recommended Next Technical Step

Turn these contracts into:

- Express route definitions
- Request validation schemas
- Service layer interfaces
- SQL migrations and seed data
