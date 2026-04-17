const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "..", "..", ".data");
const DATA_FILE = path.join(DATA_DIR, "owner-setup.json");

function createDefaultPermissions() {
  return [
    { id: "perm-1", code: "business.manage", moduleName: "Business", scope: "owner" },
    { id: "perm-2", code: "outlets.manage", moduleName: "Outlets", scope: "owner" },
    { id: "perm-3", code: "menu.manage", moduleName: "Menu", scope: "owner" },
    { id: "perm-4", code: "roles.manage", moduleName: "Roles", scope: "owner" },
    { id: "perm-5", code: "users.manage", moduleName: "Users", scope: "owner" },
    { id: "perm-6", code: "tax.manage", moduleName: "Billing", scope: "owner" },
    { id: "perm-7", code: "receipt_templates.manage", moduleName: "Billing", scope: "owner" },
    { id: "perm-8", code: "devices.manage", moduleName: "Devices", scope: "owner" },
    { id: "perm-9", code: "reports.view", moduleName: "Reports", scope: "manager" },
    { id: "perm-10", code: "operations.kot.send", moduleName: "Operations", scope: "captain" },
    { id: "perm-11", code: "operations.bill.request", moduleName: "Operations", scope: "waiter" },
    { id: "perm-12", code: "operations.discount.approve", moduleName: "Operations", scope: "manager" },
    { id: "perm-13", code: "operations.table.create", moduleName: "Operations", scope: "cashier" },
    { id: "perm-14", code: "operations.bill.split", moduleName: "Operations", scope: "captain" },
    { id: "perm-15", code: "operations.bill.edit", moduleName: "Operations", scope: "cashier" },
    { id: "perm-16", code: "operations.bill.cancel", moduleName: "Operations", scope: "manager" },
    { id: "perm-17", code: "operations.table.move", moduleName: "Operations", scope: "captain" },
    { id: "perm-18", code: "floor.area.manage", moduleName: "Floor", scope: "manager" },
    { id: "perm-19", code: "floor.table.seats.manage", moduleName: "Floor", scope: "cashier" },
    { id: "perm-20", code: "operations.kot.status.update", moduleName: "Operations", scope: "kitchen" }
  ];
}

function createDefaultRoles() {
  return [
    {
      id: "role-owner",
      name: "Owner",
      description: "Full business access across all outlets",
      permissions: [
        "business.manage",
        "outlets.manage",
        "menu.manage",
        "roles.manage",
        "users.manage",
        "tax.manage",
        "receipt_templates.manage",
        "devices.manage",
        "reports.view",
        "operations.discount.approve",
        "operations.table.create",
        "operations.bill.split",
        "operations.bill.edit",
        "operations.bill.cancel",
        "operations.table.move",
        "floor.area.manage",
        "floor.table.seats.manage",
        "operations.kot.send",
        "operations.kot.status.update"
      ]
    },
    {
      id: "role-manager",
      name: "Manager",
      description: "Outlet operations and approval access",
      permissions: [
        "menu.manage",
        "users.manage",
        "reports.view",
        "operations.discount.approve",
        "operations.bill.cancel",
        "floor.area.manage"
      ]
    },
    {
      id: "role-cashier",
      name: "Cashier",
      description: "Billing, edits, cancellations, and optional table setup",
      permissions: [
        "operations.table.create",
        "operations.bill.edit",
        "floor.table.seats.manage"
      ]
    },
    {
      id: "role-captain",
      name: "Captain",
      description: "Floor service, KOT, table movement, and split bill request",
      permissions: ["operations.kot.send", "operations.bill.split", "operations.table.move"]
    },
    {
      id: "role-waiter",
      name: "Waiter",
      description: "Service support and billing request access",
      permissions: ["operations.bill.request"]
    },
    {
      id: "role-kitchen",
      name: "Kitchen",
      description: "Kitchen ticket status updates only",
      permissions: ["operations.kot.status.update"]
    }
  ];
}

function createDefaultMenuConfig(taxProfiles = []) {
  return {
    defaultPricingMode: "Area + order type",
    pricingZones: ["AC", "Non-AC", "Self Service"],
    orderTypes: ["Dine-In", "Takeaway", "Delivery"],
    defaultTaxProfileId: taxProfiles[0]?.id || "tax-5",
    defaultPricingProfileId: "pricing-standard",
    menuStructureNote: "One page, simple assignment"
  };
}

function createDefaultPricingProfiles() {
  return [
    {
      id: "pricing-standard",
      name: "Standard Service Pricing",
      dineInMode: "Area wise",
      takeawayMode: "Single price",
      deliveryMode: "Single price",
      takeawayParcelChargeType: "None",
      takeawayParcelChargeValue: 0,
      deliveryParcelChargeType: "Fixed",
      deliveryParcelChargeValue: 25,
      isActive: true
    },
    {
      id: "pricing-premium",
      name: "Premium Delivery Pricing",
      dineInMode: "Area wise",
      takeawayMode: "Single price",
      deliveryMode: "Single price",
      takeawayParcelChargeType: "Fixed",
      takeawayParcelChargeValue: 10,
      deliveryParcelChargeType: "Percentage",
      deliveryParcelChargeValue: 5,
      isActive: false
    }
  ];
}

function createDefaultMenuGroups() {
  return [
    {
      id: "all-day",
      name: "All Day Menu",
      status: "Live",
      categoryIds: ["cat-starters", "cat-main-course", "cat-beverages"],
      channels: "Dine-In, Takeaway, Delivery",
      availability: "Always on",
      note: "Primary menu used through the full service day"
    },
    {
      id: "breakfast",
      name: "Breakfast Menu",
      status: "Scheduled",
      categoryIds: ["cat-beverages"],
      channels: "Dine-In, Takeaway",
      availability: "7:00 AM - 11:00 AM",
      note: "Shown from 7:00 AM to 11:00 AM"
    },
    {
      id: "delivery-only",
      name: "Delivery Specials",
      status: "Review",
      categoryIds: ["cat-main-course"],
      channels: "Delivery",
      availability: "6:00 PM - 10:30 PM",
      note: "Owner should review pricing and availability before launch"
    }
  ];
}

function createDefaultMenuAssignments(outlets = []) {
  return [
    {
      id: "assign-1",
      menuGroupId: "all-day",
      outletId: outlets[0]?.id || "outlet-indiranagar",
      channels: "Dine-In, Takeaway, Delivery",
      availability: "Always on",
      status: "Ready"
    },
    {
      id: "assign-2",
      menuGroupId: "breakfast",
      outletId: outlets[1]?.id || "outlet-koramangala",
      channels: "Dine-In, Takeaway",
      availability: "7:00 AM - 11:00 AM",
      status: "Scheduled"
    }
  ];
}

function createDefaultDiscountRules() {
  return [
    {
      id: "discount-lunch",
      name: "Lunch Promo",
      discountType: "percentage",
      discountScope: "order",
      value: 10,
      outletScope: "All Outlets",
      appliesToRole: "Cashier",
      requiresApproval: false,
      timeWindow: "12:00 PM - 03:00 PM",
      isActive: true,
      notes: "Lunch hour bill discount"
    },
    {
      id: "discount-takeaway",
      name: "Takeaway Saver",
      discountType: "flat",
      discountScope: "order",
      value: 50,
      outletScope: "Selected Outlets",
      appliesToRole: "Cashier",
      requiresApproval: false,
      timeWindow: "Always on",
      isActive: true,
      notes: "Takeaway bills above minimum threshold"
    }
  ];
}

function createDefaultDiscountApprovalPolicy() {
  return [
    {
      id: "approval-cashier",
      role: "Cashier",
      manualDiscountLimit: 5,
      orderVoid: "Not allowed",
      billDelete: "Not allowed",
      approvalRoute: "Above 5% goes to Manager / Owner",
      status: "Protected"
    },
    {
      id: "approval-manager",
      role: "Manager",
      manualDiscountLimit: 15,
      orderVoid: "Allowed with note",
      billDelete: "Allowed with reason",
      approvalRoute: "Above 15% goes to Owner",
      status: "Sensitive"
    },
    {
      id: "approval-owner",
      role: "Owner",
      manualDiscountLimit: 100,
      orderVoid: "Allowed",
      billDelete: "Allowed",
      approvalRoute: "Final authority",
      status: "Full access"
    }
  ];
}

function createDefaultDiscountDefaults() {
  return {
    cashierLimitPercent: 5,
    managerLimitPercent: 15,
    reasonRequired: true,
    auditLogEnabled: true,
    allowRuleStacking: false
  };
}

function createDefaultIntegrations(outlets = []) {
  return {
    zohoBooks: {
      enabled: true,
      organizationId: "",
      clientId: "",
      clientSecret: "",
      redirectUri: "",
      dataCenter: "IN",
      refreshToken: "",
      connectionStatus: "Needs setup",
      lastSyncAt: "Not synced yet",
      autoSyncSales: true,
      autoSyncPurchases: true,
      autoSyncDayClose: true
    },
    accountMapping: {
      cashSalesAccount: "Cash In Hand",
      cardSalesAccount: "Bank Account",
      upiSalesAccount: "Bank Account",
      cashOutExpenseAccount: "Outlet Expenses",
      dayCloseShortageAccount: "Revenue Loss",
      vendorPayableAccount: "Accounts Payable",
      purchaseExpenseAccount: "Kitchen Purchase"
    },
    outletMappings: outlets.map((outlet) => ({
      id: `integration-${outlet.id}`,
      outletId: outlet.id,
      outletName: outlet.name,
      zohoBooksEnabled: true,
      salesContactName: `${outlet.name} Walk-In Sales`,
      branchLabel: outlet.code || outlet.name
    })),
    vendorMappings: [
      {
        id: "vendor-a1",
        vendorName: "A1 Traders",
        zohoContactName: "A1 Traders",
        purchaseCategory: "Vegetables",
        isActive: true
      }
    ],
    purchaseEntries: [
      {
        id: "purchase-entry-1",
        outletId: outlets[0]?.id || "outlet-indiranagar",
        vendorName: "A1 Traders",
        itemName: "Vegetable Purchase",
        amount: 3200,
        expenseAccount: "Kitchen Purchase",
        status: "Queued",
        createdAt: "Today"
      }
    ],
    syncLog: []
  };
}

function createDefaultData() {
  const taxProfiles = [
    { id: "tax-5", name: "GST 5%", cgstRate: 2.5, sgstRate: 2.5, igstRate: 5, cessRate: 0, isInclusive: false, isDefault: true },
    { id: "tax-18", name: "GST 18%", cgstRate: 9, sgstRate: 9, igstRate: 18, cessRate: 0, isInclusive: false, isDefault: false }
  ];
  const outlets = [
    {
      id: "outlet-indiranagar",
      code: "BLR-01",
      name: "Indiranagar",
      gstin: "29ABCDE1234F1Z5",
      city: "Bengaluru",
      state: "Karnataka",
      isActive: true,
      hours: "8:00 AM - 11:00 PM",
      services: ["Dine-in", "Takeaway", "Delivery"],
      workAreas: ["AC", "Non-AC", "Self Service"],
      tables: [
        { id: "indr-t1", workArea: "AC", name: "T1", seats: 4 },
        { id: "indr-t2", workArea: "Non-AC", name: "T2", seats: 6 }
      ],
      reportEmail: "indiranagar-reports@saisangeet.in",
      defaultTaxProfileId: "tax-5",
      receiptTemplateId: "receipt-dine-in"
    },
    {
      id: "outlet-koramangala",
      code: "BLR-02",
      name: "Koramangala",
      gstin: "29ABCDE1234F1Z5",
      city: "Bengaluru",
      state: "Karnataka",
      isActive: true,
      hours: "9:00 AM - 11:30 PM",
      services: ["Dine-in", "Takeaway"],
      workAreas: ["AC", "Non-AC", "Only Takeaway"],
      tables: [
        { id: "kora-t1", workArea: "AC", name: "A1", seats: 4 },
        { id: "kora-t2", workArea: "Only Takeaway", name: "P1", seats: 2 }
      ],
      reportEmail: "koramangala-reports@saisangeet.in",
      defaultTaxProfileId: "tax-5",
      receiptTemplateId: "receipt-dine-in"
    }
  ];

  return {
    businessProfile: {
      id: "business-1",
      legalName: "Saisangeet Hospitality Private Limited",
      tradeName: "Saisangeet",
      gstin: "29ABCDE1234F1Z5",
      phone: "+91 98765 43210",
      email: "owner@saisangeet.in",
      addressLine1: "12 MG Road",
      addressLine2: "Near Metro Station",
      city: "Bengaluru",
      state: "Karnataka",
      postalCode: "560001",
      country: "India",
      timezone: "Asia/Kolkata",
      currencyCode: "INR",
      logoUrl: "",
      invoiceHeader: "Pure veg family restaurant",
      invoiceFooter: "Thank you, visit again"
    },
    outlets,
    permissions: createDefaultPermissions(),
    roles: createDefaultRoles(),
    users: [
      {
        id: "user-owner",
        fullName: "Amarnath",
        name: "Amarnath",
        email: "owner@restaurant.com",
        phone: null,
        passwordHash: "$2b$10$lRlp3.RYkr.Qe2.Lr9gS7uo7fyDoQRJBLis8QxtQViLFhDbbac96C",
        roles: ["Owner"],
        outletName: "All Outlets",
        isActive: true,
        pin: "1234"
      },
      {
        id: "user-manager-1",
        fullName: "Priya Manager",
        name: "Priya Manager",
        email: "manager@restaurant.com",
        phone: null,
        passwordHash: "$2b$10$9lPOhC2vubtZA2.gL4BFSucqPZTZpXAoQz/2tlnI7XTE3TnMSrJhe",
        roles: ["Manager"],
        outletName: "Indiranagar",
        isActive: true,
        pin: "2244"
      }
    ],
    taxProfiles,
    receiptTemplates: [
      { id: "receipt-dine-in", name: "Dine-In Standard", showQrPayment: true, showTaxBreakdown: true, footerNote: "Thank you, visit again", outletName: "All Outlets" },
      { id: "receipt-takeaway", name: "Takeaway Standard", showQrPayment: true, showTaxBreakdown: true, footerNote: "Packed with care", outletName: "All Outlets" }
    ],
      devices: [
      { id: "device-1", deviceName: "Front Cashier POS", deviceType: "POS Terminal", outletName: "Indiranagar", status: "active", linkCode: "INDR-1001" },
      { id: "device-2", deviceName: "Billing Counter 2", deviceType: "POS Terminal", outletName: "Koramangala", status: "inactive", linkCode: "KORA-1002" },
      { id: "device-3", deviceName: "Kitchen Printer 1", deviceType: "Kitchen Printer", outletName: "Indiranagar", status: "active", linkCode: "KPR-1003" },
      { id: "device-4", deviceName: "Hot Kitchen Display", deviceType: "Kitchen Display", outletName: "Indiranagar", status: "active", linkCode: "KDS-1004" }
    ],
    menu: {
      config: createDefaultMenuConfig(taxProfiles),
      pricingProfiles: createDefaultPricingProfiles(),
      stations: [
        { id: "station-fry", name: "Fry station" },
        { id: "station-grill", name: "Grill station" },
        { id: "station-main", name: "Main kitchen" },
        { id: "station-beverages", name: "Beverages" }
      ],
      categories: [
        { id: "cat-starters", name: "Starters", itemCount: 2, station: "Fry station", printerTarget: "Kitchen Printer 1", displayTarget: "Hot Kitchen Display" },
        { id: "cat-main-course", name: "Main Course", itemCount: 1, station: "Main kitchen", printerTarget: "Kitchen Printer 1", displayTarget: "Hot Kitchen Display" },
        { id: "cat-beverages", name: "Beverages", itemCount: 1, station: "Beverages", printerTarget: "Bar Printer", displayTarget: "Drinks Display" }
      ],
      items: [
        {
          id: "item-paneer-tikka",
          categoryId: "cat-starters",
          name: "Paneer Tikka",
          station: "Grill station",
          gstLabel: "GST 5%",
          status: "Live",
          foodType: "Veg",
          badges: ["Area + service pricing", "Available", "Tracked"],
          salesAvailability: "Available",
          outletAvailability: [
            { outlet: "Indiranagar", enabled: true },
            { outlet: "Koramangala", enabled: true }
          ],
          inventoryTracking: { enabled: true, mode: "Item wise", note: "Track sellable stock for POS and waiter ordering" },
          pricing: [
            { area: "AC", dineIn: "Rs 220", takeaway: "Rs 210", delivery: "Rs 230" },
            { area: "Non-AC", dineIn: "Rs 210", takeaway: "Rs 205", delivery: "Rs 225" },
            { area: "Self Service", dineIn: "Rs 195", takeaway: "Rs 190", delivery: "Rs 215" }
          ]
        },
        {
          id: "item-crispy-corn",
          categoryId: "cat-starters",
          name: "Crispy Corn",
          station: "Fry station",
          gstLabel: "GST 5%",
          status: "Live",
          foodType: "Veg",
          badges: ["Area + service pricing", "Available"],
          salesAvailability: "Available",
          outletAvailability: [
            { outlet: "Indiranagar", enabled: true },
            { outlet: "Koramangala", enabled: false }
          ],
          inventoryTracking: { enabled: false, mode: "Optional", note: "Inventory tracking is disabled for this item" },
          pricing: [
            { area: "AC", dineIn: "Rs 180", takeaway: "Rs 175", delivery: "Rs 195" },
            { area: "Non-AC", dineIn: "Rs 170", takeaway: "Rs 165", delivery: "Rs 185" },
            { area: "Self Service", dineIn: "Rs 160", takeaway: "Rs 155", delivery: "Rs 175" }
          ]
        },
        {
          id: "item-veg-biryani",
          categoryId: "cat-main-course",
          name: "Veg Biryani",
          station: "Main kitchen",
          gstLabel: "GST 5%",
          status: "Live",
          foodType: "Veg",
          badges: ["Popular", "Tracked"],
          salesAvailability: "Available",
          outletAvailability: [
            { outlet: "Indiranagar", enabled: true },
            { outlet: "Koramangala", enabled: true }
          ],
          inventoryTracking: { enabled: true, mode: "Category wise", note: "Included in opening stock category-wise sales tracking" },
          pricing: [
            { area: "AC", dineIn: "Rs 240", takeaway: "Rs 230", delivery: "Rs 250" },
            { area: "Non-AC", dineIn: "Rs 230", takeaway: "Rs 225", delivery: "Rs 245" },
            { area: "Self Service", dineIn: "Rs 220", takeaway: "Rs 215", delivery: "Rs 235" }
          ]
        },
        {
          id: "item-sweet-lime",
          categoryId: "cat-beverages",
          name: "Sweet Lime Soda",
          station: "Beverages",
          gstLabel: "GST 5%",
          status: "Live",
          foodType: "Veg",
          badges: ["Available"],
          salesAvailability: "Available",
          outletAvailability: [
            { outlet: "Indiranagar", enabled: true },
            { outlet: "Koramangala", enabled: true }
          ],
          inventoryTracking: { enabled: false, mode: "Optional later", note: "No stock tracking for beverages in this setup" },
          pricing: [
            { area: "AC", dineIn: "Rs 90", takeaway: "Rs 85", delivery: "Rs 95" },
            { area: "Non-AC", dineIn: "Rs 90", takeaway: "Rs 85", delivery: "Rs 95" },
            { area: "Self Service", dineIn: "Rs 90", takeaway: "Rs 85", delivery: "Rs 95" }
          ]
        }
      ],
      menuGroups: createDefaultMenuGroups(),
      menuAssignments: createDefaultMenuAssignments(outlets)
    },
    discounts: {
      rules: createDefaultDiscountRules(),
      approvalPolicy: createDefaultDiscountApprovalPolicy(),
      defaults: createDefaultDiscountDefaults()
    },
    integrations: createDefaultIntegrations(outlets)
  };
}

function normalizeOwnerSetupData(data) {
  const next = JSON.parse(JSON.stringify(data));
  const defaultPermissions = createDefaultPermissions();
  const defaultRoles = createDefaultRoles();
  next.devices = next.devices || [];
  next.outlets = (next.outlets || []).map((outlet) => ({
    hours: "9:00 AM - 11:00 PM",
    services: ["Dine-in", "Takeaway"],
    workAreas: ["AC", "Non-AC", "Self Service"],
    tables: [],
    reportEmail: "",
    ...outlet
  }));
  next.permissions = defaultPermissions.map((permission) => {
    const existing = (next.permissions || []).find((item) => item.code === permission.code);
    return existing ? { ...permission, ...existing } : permission;
  });
  next.roles = [
    ...defaultRoles.map((role) => {
      const existing = (next.roles || []).find((item) => item.name === role.name);
      return existing
        ? {
            ...role,
            ...existing,
            permissions: Array.from(new Set([...(existing.permissions || []), ...(role.permissions || [])]))
          }
        : role;
    }),
    ...(next.roles || []).filter((role) => !defaultRoles.some((defaultRole) => defaultRole.name === role.name))
  ];
  next.menu = next.menu || { categories: [], items: [] };
  next.menu.config = next.menu.config || createDefaultMenuConfig(next.taxProfiles || []);
  next.menu.pricingProfiles = next.menu.pricingProfiles || createDefaultPricingProfiles();
  next.menu.stations = (next.menu.stations || []).map((station) => ({
    id: station.id || `station-${String(station.name || "").toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    name: station.name
  }));
  next.menu.categories = (next.menu.categories || []).map((category) => ({
    station: category.station || "Main kitchen",
    printerTarget: category.printerTarget || "Kitchen Printer 1",
    displayTarget: category.displayTarget || "Hot Kitchen Display",
    ...category
  }));
  next.menu.menuGroups = (next.menu.menuGroups || createDefaultMenuGroups()).map((menuGroup) => ({
    status: "Live",
    categoryIds: [],
    channels: "Dine-In, Takeaway",
    availability: "Always on",
    note: "",
    ...menuGroup
  }));
  next.menu.menuAssignments = (next.menu.menuAssignments || createDefaultMenuAssignments(next.outlets || [])).map(
    (assignment) => ({
      channels: "Dine-In, Takeaway",
      availability: "Always on",
      status: "Ready",
      ...assignment
    })
  );
  next.discounts = next.discounts || {};
  next.discounts.rules = (next.discounts.rules || createDefaultDiscountRules()).map((rule) => ({
    discountType: "percentage",
    discountScope: "order",
    value: 0,
    outletScope: "All Outlets",
    appliesToRole: "Cashier",
    requiresApproval: false,
    timeWindow: "Always on",
    isActive: true,
    notes: "",
    ...rule
  }));
  next.discounts.approvalPolicy = (next.discounts.approvalPolicy || createDefaultDiscountApprovalPolicy())
    .filter((row) => row.role !== "Captain")
    .map((row) => ({
      manualDiscountLimit: 0,
      orderVoid: "Not allowed",
      billDelete: "Not allowed",
      approvalRoute: "Owner approval",
      status: "Protected",
      ...row
    }));
  next.discounts.defaults = {
    ...createDefaultDiscountDefaults(),
    ...(next.discounts.defaults || {})
  };
  next.integrations = next.integrations || createDefaultIntegrations(next.outlets || []);
  next.integrations.zohoBooks = {
    ...createDefaultIntegrations(next.outlets || []).zohoBooks,
    ...(next.integrations.zohoBooks || {})
  };
  next.integrations.accountMapping = {
    ...createDefaultIntegrations(next.outlets || []).accountMapping,
    ...(next.integrations.accountMapping || {})
  };
  next.integrations.outletMappings =
    next.integrations.outletMappings ||
    createDefaultIntegrations(next.outlets || []).outletMappings;
  next.integrations.vendorMappings = next.integrations.vendorMappings || [];
  next.integrations.purchaseEntries = next.integrations.purchaseEntries || [];
  next.integrations.syncLog = next.integrations.syncLog || [];

  if (!next.devices.some((device) => device.deviceType === "Kitchen Printer")) {
    next.devices.push({
      id: "device-kitchen-printer-default",
      deviceName: "Kitchen Printer 1",
      deviceType: "Kitchen Printer",
      outletName: next.outlets?.[0]?.name || "Main Outlet",
      status: "active",
      linkCode: "KPR-DEFAULT"
    });
  }

  if (!next.devices.some((device) => device.deviceType === "Kitchen Display")) {
    next.devices.push({
      id: "device-kitchen-display-default",
      deviceName: "Hot Kitchen Display",
      deviceType: "Kitchen Display",
      outletName: next.outlets?.[0]?.name || "Main Outlet",
      status: "active",
      linkCode: "KDS-DEFAULT"
    });
  }

  return next;
}

function ensureDataFile() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(createDefaultData(), null, 2));
  }
}

function readData() {
  ensureDataFile();
  const raw = fs.readFileSync(DATA_FILE, "utf8");
  return normalizeOwnerSetupData(JSON.parse(raw));
}

function writeData(data) {
  ensureDataFile();
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
  return data;
}

function getOwnerSetupData() {
  return readData();
}

function updateOwnerSetupData(updater) {
  const current = readData();
  const next = updater(JSON.parse(JSON.stringify(current)));
  return writeData(next);
}

module.exports = {
  getOwnerSetupData,
  updateOwnerSetupData
};
