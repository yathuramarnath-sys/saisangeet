/**
 * Blank starting data for every NEW customer.
 * No test outlets, no test menu, no test staff — completely empty.
 */

function createDefaultPermissions() {
  return [
    { id: "perm-1",  code: "business.manage",              moduleName: "Business",    scope: "owner" },
    { id: "perm-2",  code: "outlets.manage",               moduleName: "Outlets",     scope: "owner" },
    { id: "perm-3",  code: "menu.manage",                  moduleName: "Menu",        scope: "owner" },
    { id: "perm-4",  code: "roles.manage",                 moduleName: "Roles",       scope: "owner" },
    { id: "perm-5",  code: "users.manage",                 moduleName: "Users",       scope: "owner" },
    { id: "perm-6",  code: "tax.manage",                   moduleName: "Billing",     scope: "owner" },
    { id: "perm-7",  code: "receipt_templates.manage",     moduleName: "Billing",     scope: "owner" },
    { id: "perm-8",  code: "devices.manage",               moduleName: "Devices",     scope: "owner" },
    { id: "perm-9",  code: "reports.view",                 moduleName: "Reports",     scope: "manager" },
    { id: "perm-10", code: "operations.kot.send",          moduleName: "Operations",  scope: "captain" },
    { id: "perm-11", code: "operations.bill.request",      moduleName: "Operations",  scope: "waiter" },
    { id: "perm-12", code: "operations.discount.approve",  moduleName: "Operations",  scope: "manager" },
    { id: "perm-13", code: "operations.table.create",      moduleName: "Operations",  scope: "cashier" },
    { id: "perm-14", code: "operations.bill.split",        moduleName: "Operations",  scope: "captain" },
    { id: "perm-15", code: "operations.bill.edit",         moduleName: "Operations",  scope: "cashier" },
    { id: "perm-16", code: "operations.bill.cancel",       moduleName: "Operations",  scope: "manager" },
    { id: "perm-17", code: "operations.table.move",        moduleName: "Operations",  scope: "captain" },
    { id: "perm-18", code: "floor.area.manage",            moduleName: "Floor",       scope: "manager" },
    { id: "perm-19", code: "floor.table.seats.manage",     moduleName: "Floor",       scope: "cashier" },
    { id: "perm-20", code: "operations.kot.status.update", moduleName: "Operations",  scope: "kitchen" }
  ];
}

function createDefaultRoles() {
  return [
    {
      id: "role-owner", name: "Owner",
      description: "Full business access across all outlets",
      permissions: [
        "business.manage","outlets.manage","menu.manage","roles.manage","users.manage",
        "tax.manage","receipt_templates.manage","devices.manage","reports.view",
        "operations.discount.approve","operations.table.create","operations.bill.split",
        "operations.bill.edit","operations.bill.cancel","operations.table.move",
        "floor.area.manage","floor.table.seats.manage","operations.kot.send",
        "operations.kot.status.update"
      ]
    },
    {
      id: "role-manager", name: "Manager",
      description: "Outlet operations and approval access",
      permissions: ["menu.manage","users.manage","reports.view","operations.discount.approve","operations.bill.cancel","floor.area.manage"]
    },
    {
      id: "role-cashier", name: "Cashier",
      description: "Billing and table setup",
      permissions: ["operations.table.create","operations.bill.edit","floor.table.seats.manage"]
    },
    {
      id: "role-captain", name: "Captain",
      description: "Floor service, KOT and split bill",
      permissions: ["operations.kot.send","operations.bill.split","operations.table.move"]
    },
    {
      id: "role-waiter", name: "Waiter",
      description: "Service and billing request",
      permissions: ["operations.bill.request"]
    },
    {
      id: "role-kitchen", name: "Kitchen",
      description: "Kitchen ticket status updates",
      permissions: ["operations.kot.status.update"]
    }
  ];
}

function createBlankTenantData({ ownerName, ownerEmail, ownerPhone, restaurantName, passwordHash, userId } = {}) {
  return {
    businessProfile: {
      id:           "business-1",
      legalName:    restaurantName || "",
      tradeName:    restaurantName || "",
      gstin:        "",
      phone:        ownerPhone || "",
      email:        ownerEmail || "",
      addressLine1: "",
      addressLine2: "",
      city:         "",
      state:        "",
      postalCode:   "",
      country:      "India",
      timezone:     "Asia/Kolkata",
      currencyCode: "INR",
      logoUrl:      "",
      invoiceHeader: "",
      invoiceFooter: "Thank you, visit again"
    },

    outlets:     [],   // owner adds their own outlets
    devices:     [],
    signupLeads: [],

    permissions: createDefaultPermissions(),
    roles:       createDefaultRoles(),

    users: ownerEmail ? [
      {
        id:           userId || `user-owner-${Date.now()}`,
        fullName:     ownerName || "",
        name:         ownerName || "",
        email:        ownerEmail,
        phone:        ownerPhone || null,
        passwordHash: passwordHash || null,
        roles:        ["Owner"],
        outletName:   "All Outlets",
        isActive:     true,
        pin:          "0000"
      }
    ] : [],

    taxProfiles: [
      { id: "tax-5",  name: "GST 5%",  cgstRate: 2.5, sgstRate: 2.5, igstRate: 5,  cessRate: 0, isInclusive: false, isDefault: true  },
      { id: "tax-12", name: "GST 12%", cgstRate: 6,   sgstRate: 6,   igstRate: 12, cessRate: 0, isInclusive: false, isDefault: false },
      { id: "tax-18", name: "GST 18%", cgstRate: 9,   sgstRate: 9,   igstRate: 18, cessRate: 0, isInclusive: false, isDefault: false }
    ],

    receiptTemplates: [
      { id: "receipt-dine-in",   name: "Dine-In Standard",   showQrPayment: true, showTaxBreakdown: true, footerNote: "Thank you, visit again", outletName: "All Outlets" },
      { id: "receipt-takeaway",  name: "Takeaway Standard",  showQrPayment: true, showTaxBreakdown: true, footerNote: "Packed with care",       outletName: "All Outlets" }
    ],

    menu: {
      config: {
        defaultPricingMode: "Area + order type",
        pricingZones:       ["AC", "Non-AC", "Self Service"],
        orderTypes:         ["Dine-In", "Takeaway", "Delivery"],
        defaultTaxProfileId: "tax-5",
        defaultPricingProfileId: "pricing-standard"
      },
      pricingProfiles: [
        {
          id: "pricing-standard", name: "Standard Service Pricing",
          dineInMode: "Area wise", takeawayMode: "Single price", deliveryMode: "Single price",
          takeawayParcelChargeType: "None", takeawayParcelChargeValue: 0,
          deliveryParcelChargeType: "Fixed", deliveryParcelChargeValue: 25,
          isActive: true
        }
      ],
      stations:        [],
      categories:      [],
      items:           [],
      menuGroups:      [],
      menuAssignments: []
    },

    discounts: {
      rules: [],
      approvalPolicy: [
        { id: "approval-cashier",  role: "Cashier",  manualDiscountLimit: 5,   orderVoid: "Not allowed",        billDelete: "Not allowed",        approvalRoute: "Above 5% goes to Manager / Owner", status: "Protected" },
        { id: "approval-manager",  role: "Manager",  manualDiscountLimit: 15,  orderVoid: "Allowed with note",  billDelete: "Allowed with reason", approvalRoute: "Above 15% goes to Owner",          status: "Sensitive" },
        { id: "approval-owner",    role: "Owner",    manualDiscountLimit: 100, orderVoid: "Allowed",            billDelete: "Allowed",             approvalRoute: "Final authority",                  status: "Full access" }
      ],
      defaults: {
        cashierLimitPercent: 5, managerLimitPercent: 15,
        reasonRequired: true, auditLogEnabled: true, allowRuleStacking: false
      }
    },

    integrations: {
      zohoBooks: {
        enabled: false, organizationId: "", clientId: "", clientSecret: "",
        redirectUri: "", dataCenter: "IN", refreshToken: "",
        connectionStatus: "Not connected", lastSyncAt: "Not synced yet",
        autoSyncSales: true, autoSyncPurchases: true, autoSyncDayClose: true
      },
      accountMapping: {
        cashSalesAccount: "Cash In Hand", cardSalesAccount: "Bank Account",
        upiSalesAccount: "Bank Account", cashOutExpenseAccount: "Outlet Expenses",
        dayCloseShortageAccount: "Revenue Loss", vendorPayableAccount: "Accounts Payable",
        purchaseExpenseAccount: "Kitchen Purchase"
      },
      outletMappings: [], vendorMappings: [], purchaseEntries: [], syncLog: []
    }
  };
}

module.exports = { createBlankTenantData, createDefaultPermissions, createDefaultRoles };
