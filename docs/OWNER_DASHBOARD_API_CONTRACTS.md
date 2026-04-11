# Owner Dashboard API Contracts

## 1. Scope

These contracts define the first implementation stage of the platform:

- Business profile setup
- Outlet configuration
- Category and item master management
- Role and permission management
- User management
- Discount rules
- Security settings
- Tax setup
- Receipt templates
- Device management and POS linking

Base path:

`/api/v1`

## 2. Business Profile APIs

### GET `/api/v1/business-profile`

Response:

```json
{
  "id": "uuid",
  "legalName": "A2B Foods Private Limited",
  "tradeName": "A2B Kitchens",
  "gstin": "29ABCDE1234F1Z5",
  "phone": "9876543210",
  "email": "owner@a2bkitchens.com",
  "address": {
    "addressLine1": "12 MG Road",
    "city": "Bengaluru",
    "state": "Karnataka",
    "postalCode": "560001",
    "country": "India"
  },
  "timezone": "Asia/Kolkata",
  "currencyCode": "INR",
  "invoiceHeader": "Thank you for visiting",
  "invoiceFooter": "Visit again"
}
```

### PATCH `/api/v1/business-profile`

Permissions:

- `business.manage`

Request:

```json
{
  "legalName": "A2B Foods Private Limited",
  "tradeName": "A2B Kitchens",
  "gstin": "29ABCDE1234F1Z5",
  "phone": "9876543210",
  "email": "owner@a2bkitchens.com",
  "addressLine1": "12 MG Road",
  "city": "Bengaluru",
  "state": "Karnataka",
  "postalCode": "560001",
  "timezone": "Asia/Kolkata",
  "invoiceHeader": "Welcome",
  "invoiceFooter": "Thank you"
}
```

## 3. Outlet Setup APIs

### GET `/api/v1/outlets`

Response:

```json
[
  {
    "id": "uuid",
    "code": "BLR-01",
    "name": "Indiranagar",
    "isActive": true,
    "city": "Bengaluru"
  }
]
```

### POST `/api/v1/outlets`

Permissions:

- `outlets.manage`

Request:

```json
{
  "code": "BLR-01",
  "name": "Indiranagar",
  "gstin": "29ABCDE1234F1Z5",
  "phone": "9876543210",
  "addressLine1": "100 Feet Road",
  "city": "Bengaluru",
  "state": "Karnataka",
  "postalCode": "560038",
  "timezone": "Asia/Kolkata"
}
```

### PATCH `/api/v1/outlets/:id/settings`

Permissions:

- `outlets.manage`

Request:

```json
{
  "openingTime": "09:00:00",
  "closingTime": "23:30:00",
  "enableDineIn": true,
  "enableTakeaway": true,
  "enableDelivery": true,
  "allowOfflineBilling": true,
  "defaultReceiptTemplateId": "uuid",
  "defaultTaxProfileId": "uuid"
}
```

## 4. Category and Item Master APIs

### POST `/api/v1/menu/categories`

Permissions:

- `categories.manage`

Request:

```json
{
  "outletId": "uuid",
  "name": "Main Course",
  "sortOrder": 2
}
```

### POST `/api/v1/menu/items`

Permissions:

- `items.manage`

Request:

```json
{
  "outletId": "uuid",
  "categoryId": "uuid",
  "taxProfileId": "uuid",
  "name": "Butter Naan",
  "basePrice": 45.0,
  "isVeg": true,
  "isFavorite": true,
  "kitchenStation": "tandoor"
}
```

## 5. Role and Permission APIs

### GET `/api/v1/roles`

Response:

```json
[
  {
    "id": "uuid",
    "name": "manager",
    "permissions": ["items.manage", "reports.view"]
  }
]
```

### GET `/api/v1/permissions`

Response:

```json
[
  {
    "id": "uuid",
    "code": "items.manage",
    "moduleName": "menu",
    "scope": "outlet"
  }
]
```

### POST `/api/v1/roles`

Permissions:

- `roles.manage`

Request:

```json
{
  "name": "captain",
  "description": "Captain can manage tables and send KOT",
  "permissionCodes": [
    "reports.view"
  ]
}
```

### POST `/api/v1/users`

Permissions:

- `users.manage`

Request:

```json
{
  "fullName": "Kiran",
  "phone": "9123456789",
  "password": "StrongPass123",
  "pin": "1234",
  "outletId": "uuid",
  "roleIds": ["uuid"]
}
```

## 6. Discount Management APIs

### GET `/api/v1/settings/discount-rules`

Response:

```json
[
  {
    "id": "uuid",
    "name": "Festival Offer",
    "discountType": "percentage",
    "discountScope": "order",
    "value": 10.0,
    "requiresApproval": true,
    "isActive": true
  }
]
```

### POST `/api/v1/settings/discount-rules`

Permissions:

- `discounts.manage`

Request:

```json
{
  "outletId": "uuid",
  "name": "Festival Offer",
  "discountType": "percentage",
  "discountScope": "order",
  "value": 10.0,
  "maxAmount": 500.0,
  "requiresApproval": true,
  "startsAt": "2026-04-10T00:00:00Z",
  "endsAt": "2026-04-20T23:59:59Z"
}
```

## 7. Security Settings APIs

### GET `/api/v1/settings/security`

Response:

```json
{
  "passwordMinLength": 8,
  "requireUppercase": false,
  "requireNumber": true,
  "requireSpecialCharacter": false,
  "pinLength": 4,
  "sessionTimeoutMinutes": 30,
  "allowMultipleActiveSessions": true,
  "lockAfterFailedAttempts": 5,
  "approvalRules": [
    {
      "approvalType": "discount",
      "requiresManager": true,
      "requiresOwner": false,
      "maxCashierDiscountPercent": 5.0,
      "maxManagerDiscountPercent": 15.0
    }
  ]
}
```

### PATCH `/api/v1/settings/security`

Permissions:

- `security.manage`

Request:

```json
{
  "passwordMinLength": 8,
  "requireUppercase": true,
  "requireNumber": true,
  "pinLength": 4,
  "sessionTimeoutMinutes": 20,
  "lockAfterFailedAttempts": 3,
  "approvalRules": [
    {
      "approvalType": "discount",
      "requiresManager": true,
      "requiresOwner": false,
      "maxCashierDiscountPercent": 5.0,
      "maxManagerDiscountPercent": 15.0
    }
  ]
}
```

## 8. Tax Setup APIs

### GET `/api/v1/settings/tax-profiles`

Response:

```json
[
  {
    "id": "uuid",
    "name": "GST 5%",
    "cgstRate": 2.5,
    "sgstRate": 2.5,
    "igstRate": 0,
    "isInclusive": false,
    "isDefault": true
  }
]
```

### POST `/api/v1/settings/tax-profiles`

Permissions:

- `tax.manage`

Request:

```json
{
  "name": "GST 18%",
  "cgstRate": 9.0,
  "sgstRate": 9.0,
  "igstRate": 0,
  "cessRate": 0,
  "isInclusive": false,
  "isDefault": false
}
```

## 9. Receipt Template APIs

### GET `/api/v1/settings/receipt-templates`

Response:

```json
[
  {
    "id": "uuid",
    "name": "Default Dine-In",
    "templateType": "dine_in",
    "showLogo": true,
    "showQrPayment": true,
    "showTaxBreakdown": true,
    "isDefault": true
  }
]
```

### POST `/api/v1/settings/receipt-templates`

Permissions:

- `receipt_templates.manage`

Request:

```json
{
  "outletId": "uuid",
  "name": "Default Dine-In",
  "templateType": "dine_in",
  "headerText": "Welcome",
  "footerText": "Thank you, visit again",
  "showLogo": true,
  "showQrPayment": true,
  "showTaxBreakdown": true,
  "showCustomerDetails": true,
  "isDefault": true
}
```

## 10. Device Management APIs

### GET `/api/v1/devices`

Response:

```json
[
  {
    "id": "uuid",
    "deviceType": "pos_terminal",
    "deviceName": "Front Counter POS",
    "platform": "android",
    "status": "active",
    "outletId": "uuid",
    "lastSeenAt": "2026-04-10T10:00:00Z"
  }
]
```

### POST `/api/v1/devices/link-token`

Permissions:

- `devices.manage`

Purpose:

- Generate code or QR payload for POS linking

Request:

```json
{
  "outletId": "uuid",
  "deviceType": "pos_terminal",
  "expiresInMinutes": 15
}
```

Response:

```json
{
  "tokenId": "uuid",
  "tokenCode": "POS24190",
  "qrPayload": "pos://link/POS24190",
  "expiresAt": "2026-04-10T10:15:00Z"
}
```

### POST `/api/v1/devices/link`

Purpose:

- Link installed POS machine to owner-configured business and outlet

Request:

```json
{
  "tokenCode": "POS24190",
  "deviceIdentifier": "android-serial-001",
  "deviceName": "Billing Counter 1",
  "platform": "android",
  "appVersion": "1.0.0",
  "localIp": "192.168.1.10"
}
```

Response:

```json
{
  "device": {
    "id": "uuid",
    "status": "active",
    "outletId": "uuid",
    "deviceType": "pos_terminal"
  },
  "syncPayload": {
    "businessProfile": {
      "tradeName": "A2B Kitchens"
    },
    "outlet": {
      "id": "uuid",
      "name": "Indiranagar"
    },
    "receiptTemplateId": "uuid",
    "taxProfileId": "uuid"
  }
}
```

### PATCH `/api/v1/devices/:id/status`

Permissions:

- `devices.manage`

Request:

```json
{
  "status": "blocked"
}
```

## 11. Owner Dashboard Reports Access

### GET `/api/v1/reports/access-summary`

Purpose:

- Return high-level cards for owner dashboard home

Response:

```json
{
  "outletCount": 4,
  "activePosDevices": 6,
  "activeUsers": 28,
  "todaySales": 245000.0,
  "todayOrders": 512
}
```

## 12. Error Contract

```json
{
  "error": {
    "code": "DEVICE_TOKEN_EXPIRED",
    "message": "The device link token has expired",
    "details": {}
  }
}
```

Recommended codes:

- `BUSINESS_PROFILE_NOT_FOUND`
- `OUTLET_NOT_FOUND`
- `ROLE_NOT_FOUND`
- `PERMISSION_NOT_FOUND`
- `DEVICE_TOKEN_EXPIRED`
- `DEVICE_TOKEN_INVALID`
- `DEVICE_ALREADY_LINKED`
- `INSUFFICIENT_PERMISSION`

## 13. Recommended Next Build Step

Turn these APIs into:

- Express route modules
- Validation schemas
- Controller and service boundaries
- SQL migrations and seed data
