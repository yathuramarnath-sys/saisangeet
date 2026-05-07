const fs   = require("fs");
const path = require("path");

const { getCurrentTenantId } = require("./tenant-context");

const DATA_DIR       = path.join(__dirname, "..", "..", ".data");
const TENANTS_DIR    = path.join(DATA_DIR, "tenants");
const DEFAULT_FILE   = path.join(DATA_DIR, "owner-setup.json");   // admin / default tenant

// ── In-memory cache ─────────────────────────────────────────────────────────
// Populated at startup by migrate.js → warmTenantCache().
// Reads are synchronous (no async needed in service modules).
// Writes update the cache first, then persist to Postgres (fire-and-forget).
const _cache = new Map();

/**
 * Called by migrate.js at startup to pre-populate the cache from DB or JSON.
 */
function warmTenantCache(tenantId, rawData) {
  _cache.set(tenantId, normalizeOwnerSetupData(rawData));
}

// ── File helpers ─────────────────────────────────────────────────────────────

function getTenantFile(tenantId) {
  if (!tenantId || tenantId === "default") return DEFAULT_FILE;
  if (!fs.existsSync(TENANTS_DIR)) fs.mkdirSync(TENANTS_DIR, { recursive: true });
  return path.join(TENANTS_DIR, `${tenantId}.json`);
}

const DATA_FILE = DEFAULT_FILE; // backward-compat alias

function ensureDataFile(file) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(file) && file === DEFAULT_FILE) {
    fs.writeFileSync(file, JSON.stringify(createDefaultData(), null, 2));
  }
}

function readFromFile(tenantId) {
  const file = getTenantFile(tenantId);
  ensureDataFile(file);
  if (!fs.existsSync(file)) return normalizeOwnerSetupData({});
  try {
    return normalizeOwnerSetupData(JSON.parse(fs.readFileSync(file, "utf8")));
  } catch {
    return normalizeOwnerSetupData({});
  }
}

function writeToFile(tenantId, data) {
  const file = getTenantFile(tenantId);
  ensureDataFile(file);
  try {
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error("[store] JSON file write failed:", err.message);
  }
}

// ── Postgres helpers ─────────────────────────────────────────────────────────

function persistToPostgres(tenantId, data) {
  // Fire-and-forget — never blocks the caller
  setImmediate(async () => {
    try {
      const { query } = require("../db/pool");
      await query(
        `INSERT INTO tenant_settings (tenant_id, key, value, updated_at)
         VALUES ($1, 'owner_setup', $2, NOW())
         ON CONFLICT (tenant_id, key)
         DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
        [tenantId, JSON.stringify(data)]
      );
    } catch (err) {
      console.error("[store] Postgres write failed:", err.message);
      // Fallback: ensure file is also up to date
      writeToFile(tenantId, data);
    }
  });
}

/**
 * Same as persistToPostgres but awaitable — used when the caller MUST ensure
 * the data survives a server restart before returning a response (e.g. link tokens).
 */
async function persistToPostgresNow(tenantId, data) {
  try {
    const { query } = require("../db/pool");
    await query(
      `INSERT INTO tenant_settings (tenant_id, key, value, updated_at)
       VALUES ($1, 'owner_setup', $2, NOW())
       ON CONFLICT (tenant_id, key)
       DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
      [tenantId, JSON.stringify(data)]
    );
  } catch (err) {
    console.error("[store] Postgres sync write failed (non-fatal):", err.message);
  }
}

// ── Core read / write ────────────────────────────────────────────────────────

function readData() {
  const tenantId = getCurrentTenantId();

  // Fast path: in-memory cache (populated at startup)
  if (_cache.has(tenantId)) return _cache.get(tenantId);

  // Cold-start fallback: load from JSON file
  // (happens on first request before migrate has a chance to run — very rare)
  const data = readFromFile(tenantId);
  _cache.set(tenantId, data);
  return data;
}

// ── Auth-field guard ─────────────────────────────────────────────────────────
/**
 * Called inside every write path before the data touches cache / DB / file.
 *
 * Protects users who had BOTH email AND passwordHash in `current` (the
 * pre-update snapshot):
 *  - If a write drops `email` or `passwordHash` for such a user, restores them.
 *  - If such a user is removed entirely from the users[] array, adds them back.
 *
 * This is intentionally silent about legitimate password changes: those always
 * set passwordHash to a new *truthy* bcrypt string, so the guard never fires.
 * The guard only fires when a field goes from truthy → falsy (i.e. is dropped).
 */
function guardOwnerAuth(current, next) {
  if (!current || !next) return next;

  const authUsers = (current.users || []).filter((u) => u.email && u.passwordHash);
  if (authUsers.length === 0) return next;

  let modified = false;
  const nextUsers = (next.users || []).slice(); // mutable shallow copy

  for (const src of authUsers) {
    const idx = nextUsers.findIndex((u) => u.id === src.id);

    if (idx === -1) {
      // Auth user was completely removed from the array — add back + log
      console.error(
        `[store] GUARD: removal of authenticated user ${src.id} (${src.email}) was blocked`
      );
      nextUsers.push(src);
      modified = true;
      continue;
    }

    const dst   = nextUsers[idx];
    const patch = {};
    if (!dst.email        && src.email)        patch.email        = src.email;
    if (!dst.passwordHash && src.passwordHash) patch.passwordHash = src.passwordHash;

    if (Object.keys(patch).length) {
      console.warn(
        `[store] GUARD: restored auth fields [${Object.keys(patch).join(", ")}] ` +
        `for user ${src.id} (${src.email})`
      );
      nextUsers[idx] = { ...dst, ...patch };
      modified = true;
    }
  }

  return modified ? { ...next, users: nextUsers } : next;
}

function writeData(data) {
  const tenantId = getCurrentTenantId();
  const current  = _cache.get(tenantId); // snapshot before this write

  // Guard: never drop email/passwordHash from authenticated accounts
  const safe = current ? guardOwnerAuth(current, data) : data;

  // 1. Update in-memory cache immediately (synchronous, instant)
  _cache.set(tenantId, safe);

  // 2. Persist to Postgres asynchronously
  persistToPostgres(tenantId, safe);

  // 3. Also keep JSON file in sync (cheap, used as fallback + local dev)
  writeToFile(tenantId, safe);

  return safe;
}

// ── Public API ───────────────────────────────────────────────────────────────

function getOwnerSetupData() {
  return readData();
}

function updateOwnerSetupData(updater) {
  const current = readData();
  const next    = updater(JSON.parse(JSON.stringify(current)));
  return writeData(next);
}

/**
 * Like updateOwnerSetupData but also awaits the Postgres write.
 * Use this when the written data must survive a server restart before
 * the HTTP response is sent — e.g. generating a device link token.
 */
async function updateOwnerSetupDataNow(updater) {
  const tenantId = getCurrentTenantId();
  const current  = readData();
  const next     = updater(JSON.parse(JSON.stringify(current)));
  // Guard: never drop email/passwordHash from authenticated accounts
  const safe     = guardOwnerAuth(current, next);
  _cache.set(tenantId, safe);
  writeToFile(tenantId, safe);
  await persistToPostgresNow(tenantId, safe);
  return safe;
}

/**
 * Create a brand-new tenant file with blank starting data.
 * Called once during enrollment.
 */
function createTenantFile(tenantId, initialData) {
  if (!fs.existsSync(TENANTS_DIR)) fs.mkdirSync(TENANTS_DIR, { recursive: true });
  const normalized = normalizeOwnerSetupData(initialData);
  _cache.set(tenantId, normalized);
  writeToFile(tenantId, normalized);
  persistToPostgres(tenantId, normalized);
}

/**
 * Search every cached tenant for a user that has the given reset token
 * and whose expiry is still in the future.
 * Returns { tenantId, user } or null.
 */
function findUserByResetToken(token) {
  // ── 1. Fast path: in-memory cache ────────────────────────────────────────
  for (const [tenantId, data] of _cache) {
    const user = (data.users || []).find(
      (u) => u.resetToken === token && u.resetTokenExpiry > Date.now()
    );
    if (user) return { tenantId, user };
  }

  // ── 2. Slow path: query Postgres for the token ────────────────────────────
  // Needed when the server restarted (cache cleared) after the token was saved.
  // Returns a Promise — callers that need this must await.
  return (async () => {
    try {
      const { query } = require("../db/pool");
      const result = await query(
        `SELECT tenant_id, value FROM tenant_settings WHERE key = 'owner_setup'`
      );
      for (const row of result.rows) {
        let data = {};
        try {
          data = typeof row.value === "string" ? JSON.parse(row.value) : (row.value || {});
        } catch (_) { continue; }

        const user = (data.users || []).find(
          (u) => u.resetToken === token && u.resetTokenExpiry > Date.now()
        );
        if (user) {
          // Warm the cache so subsequent calls are fast
          warmTenantCache(row.tenant_id, data);
          return { tenantId: row.tenant_id, user };
        }
      }
    } catch (_) { /* DB unavailable — fall through */ }
    return null;
  })();
}

/**
 * Search every cached tenant for a pending link token that matches linkCode
 * and hasn't expired yet.
 * Returns { tenantId, token } or null.
 * Used by resolveLinkCode when the Postgres pending_link_tokens insert failed
 * and the token is only available in the in-memory owner_setup cache.
 */
function findTenantByLinkToken(linkCode) {
  const lc = linkCode.toLowerCase();
  for (const [tenantId, data] of _cache) {
    const token = (data.pendingLinkTokens || []).find(
      (t) => t.linkCode && t.linkCode.toLowerCase() === lc && t.expiresAt > Date.now()
    );
    if (token) return { tenantId, token };
  }
  return null;
}

/**
 * Returns the raw Map of all cached tenants.
 * Used by resolveLinkCode Stage 4 nuclear fallback — scans every tenant's
 * outlets to find one whose code matches the link-code prefix.
 */
function getAllCachedTenants() {
  return _cache;
}

module.exports = {
  getOwnerSetupData,
  updateOwnerSetupData,
  updateOwnerSetupDataNow,
  createTenantFile,
  findUserByResetToken,
  findTenantByLinkToken,
  getAllCachedTenants,
  // Exported for migrate.js only:
  warmTenantCache,
  // Exported for testing only:
  _guardOwnerAuth: guardOwnerAuth,
};

// ─────────────────────────────────────────────────────────────────────────────
//  Default data builders (unchanged from original)
// ─────────────────────────────────────────────────────────────────────────────

function createDefaultPermissions() {
  return [
    { id: "perm-1",  code: "business.manage",               moduleName: "Business",    scope: "owner"   },
    { id: "perm-2",  code: "outlets.manage",                moduleName: "Outlets",     scope: "owner"   },
    { id: "perm-3",  code: "menu.manage",                   moduleName: "Menu",        scope: "owner"   },
    { id: "perm-4",  code: "roles.manage",                  moduleName: "Roles",       scope: "owner"   },
    { id: "perm-5",  code: "users.manage",                  moduleName: "Users",       scope: "owner"   },
    { id: "perm-6",  code: "tax.manage",                    moduleName: "Billing",     scope: "owner"   },
    { id: "perm-7",  code: "receipt_templates.manage",      moduleName: "Billing",     scope: "owner"   },
    { id: "perm-8",  code: "devices.manage",                moduleName: "Devices",     scope: "owner"   },
    { id: "perm-9",  code: "reports.view",                  moduleName: "Reports",     scope: "manager" },
    { id: "perm-10", code: "operations.kot.send",           moduleName: "Operations",  scope: "captain" },
    { id: "perm-11", code: "operations.bill.request",       moduleName: "Operations",  scope: "waiter"  },
    { id: "perm-12", code: "operations.discount.approve",   moduleName: "Operations",  scope: "manager" },
    { id: "perm-13", code: "operations.table.create",       moduleName: "Operations",  scope: "cashier" },
    { id: "perm-14", code: "operations.bill.split",         moduleName: "Operations",  scope: "captain" },
    { id: "perm-15", code: "operations.bill.edit",          moduleName: "Operations",  scope: "cashier" },
    { id: "perm-16", code: "operations.bill.cancel",        moduleName: "Operations",  scope: "manager" },
    { id: "perm-17", code: "operations.table.move",         moduleName: "Operations",  scope: "captain" },
    { id: "perm-18", code: "floor.area.manage",             moduleName: "Floor",       scope: "manager" },
    { id: "perm-19", code: "floor.table.seats.manage",      moduleName: "Floor",       scope: "cashier" },
    { id: "perm-20", code: "operations.kot.status.update",  moduleName: "Operations",  scope: "kitchen" },
  ];
}

function createDefaultRoles() {
  return [
    {
      id: "role-owner",
      name: "Owner",
      description: "Full business access across all outlets",
      permissions: [
        "business.manage","outlets.manage","menu.manage","roles.manage","users.manage",
        "tax.manage","receipt_templates.manage","devices.manage","reports.view",
        "operations.discount.approve","operations.table.create","operations.bill.split",
        "operations.bill.edit","operations.bill.cancel","operations.table.move",
        "floor.area.manage","floor.table.seats.manage","operations.kot.send",
        "operations.kot.status.update",
      ],
    },
    {
      id: "role-manager",
      name: "Manager",
      description: "Outlet operations and approval access",
      permissions: [
        "menu.manage","users.manage","reports.view","operations.discount.approve",
        "operations.bill.cancel","floor.area.manage",
      ],
    },
    {
      id: "role-cashier",
      name: "Cashier",
      description: "Billing, edits, cancellations, and optional table setup",
      permissions: ["operations.table.create","operations.bill.edit","floor.table.seats.manage"],
    },
    {
      id: "role-captain",
      name: "Captain",
      description: "Floor service, KOT, table movement, and split bill request",
      permissions: ["operations.kot.send","operations.bill.split","operations.table.move"],
    },
    {
      id: "role-waiter",
      name: "Waiter",
      description: "Service support and billing request access",
      permissions: ["operations.bill.request"],
    },
    {
      id: "role-kitchen",
      name: "Kitchen",
      description: "Kitchen ticket status updates only",
      permissions: ["operations.kot.status.update"],
    },
  ];
}

function createDefaultMenuConfig(taxProfiles = []) {
  return {
    defaultPricingMode:    "Area + order type",
    pricingZones:          ["AC", "Non-AC", "Self Service"],
    orderTypes:            ["Dine-In", "Takeaway", "Delivery"],
    defaultTaxProfileId:   taxProfiles[0]?.id || "tax-5",
    defaultPricingProfileId: "pricing-standard",
    menuStructureNote:     "One page, simple assignment",
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
      isActive: true,
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
      isActive: false,
    },
  ];
}

function createDefaultMenuGroups() {
  return [
    {
      id: "all-day",
      name: "All Day Menu",
      status: "Live",
      categoryIds: ["cat-starters","cat-main-course","cat-beverages"],
      channels: "Dine-In, Takeaway, Delivery",
      availability: "Always on",
      note: "Primary menu used through the full service day",
    },
    {
      id: "breakfast",
      name: "Breakfast Menu",
      status: "Scheduled",
      categoryIds: ["cat-beverages"],
      channels: "Dine-In, Takeaway",
      availability: "7:00 AM - 11:00 AM",
      note: "Shown from 7:00 AM to 11:00 AM",
    },
    {
      id: "delivery-only",
      name: "Delivery Specials",
      status: "Review",
      categoryIds: ["cat-main-course"],
      channels: "Delivery",
      availability: "6:00 PM - 10:30 PM",
      note: "Owner should review pricing and availability before launch",
    },
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
      status: "Ready",
    },
    {
      id: "assign-2",
      menuGroupId: "breakfast",
      outletId: outlets[1]?.id || "outlet-koramangala",
      channels: "Dine-In, Takeaway",
      availability: "7:00 AM - 11:00 AM",
      status: "Scheduled",
    },
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
      notes: "Lunch hour bill discount",
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
      notes: "Takeaway bills above minimum threshold",
    },
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
      status: "Protected",
    },
    {
      id: "approval-manager",
      role: "Manager",
      manualDiscountLimit: 15,
      orderVoid: "Allowed with note",
      billDelete: "Allowed with reason",
      approvalRoute: "Above 15% goes to Owner",
      status: "Sensitive",
    },
    {
      id: "approval-owner",
      role: "Owner",
      manualDiscountLimit: 100,
      orderVoid: "Allowed",
      billDelete: "Allowed",
      approvalRoute: "Final authority",
      status: "Full access",
    },
  ];
}

function createDefaultDiscountDefaults() {
  return {
    cashierLimitPercent: 5,
    managerLimitPercent: 15,
    reasonRequired: true,
    auditLogEnabled: true,
    allowRuleStacking: false,
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
      autoSyncDayClose: true,
    },
    accountMapping: {
      cashSalesAccount: "Cash In Hand",
      cardSalesAccount: "Bank Account",
      upiSalesAccount: "Bank Account",
      cashOutExpenseAccount: "Outlet Expenses",
      dayCloseShortageAccount: "Revenue Loss",
      vendorPayableAccount: "Accounts Payable",
      purchaseExpenseAccount: "Kitchen Purchase",
    },
    outletMappings: outlets.map((outlet) => ({
      id: `integration-${outlet.id}`,
      outletId: outlet.id,
      outletName: outlet.name,
      zohoBooksEnabled: true,
      salesContactName: `${outlet.name} Walk-In Sales`,
      branchLabel: outlet.code || outlet.name,
    })),
    vendorMappings: [
      { id: "vendor-a1", vendorName: "A1 Traders", zohoContactName: "A1 Traders", purchaseCategory: "Vegetables", isActive: true },
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
        createdAt: "Today",
      },
    ],
    syncLog: [],
  };
}

function createDefaultData() {
  const taxProfiles = [
    { id: "tax-5",  name: "GST 5%",  cgstRate: 2.5, sgstRate: 2.5, igstRate: 5,  cessRate: 0, isInclusive: false, isDefault: true  },
    { id: "tax-18", name: "GST 18%", cgstRate: 9,   sgstRate: 9,   igstRate: 18, cessRate: 0, isInclusive: false, isDefault: false },
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
      services: ["Dine-in","Takeaway","Delivery"],
      workAreas: ["AC","Non-AC","Self Service"],
      tables: [
        { id: "indr-t1", workArea: "AC",     name: "T1", seats: 4 },
        { id: "indr-t2", workArea: "Non-AC", name: "T2", seats: 6 },
      ],
      reportEmail: "indiranagar-reports@saisangeet.in",
      defaultTaxProfileId: "tax-5",
      receiptTemplateId: "receipt-dine-in",
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
      services: ["Dine-in","Takeaway"],
      workAreas: ["AC","Non-AC","Only Takeaway"],
      tables: [
        { id: "kora-t1", workArea: "AC",            name: "A1", seats: 4 },
        { id: "kora-t2", workArea: "Only Takeaway", name: "P1", seats: 2 },
      ],
      reportEmail: "koramangala-reports@saisangeet.in",
      defaultTaxProfileId: "tax-5",
      receiptTemplateId: "receipt-dine-in",
    },
  ];

  return {
    businessProfile: {
      id: "business-1",
      legalName: "Saisangeet Hospitality Private Limited",
      tradeName: "Saisangeet",
      gstin: "29ABCDE1234F1Z5",
      phone: "+91 98765 43210",
      email: "info@dinexpos.in",
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
      invoiceFooter: "Thank you, visit again",
    },
    outlets,
    permissions: createDefaultPermissions(),
    roles: createDefaultRoles(),
    users: [
      {
        id: "user-owner",
        fullName: "Amarnath",
        name: "Amarnath",
        email: "info@dinexpos.in",
        phone: "+919876543210",
        // bcrypt hash of "Dine@2025"
        passwordHash: "$2b$10$AKd7eYWKnyxcoLQG/IznSu5W.L168EHROC7pkr/6UtVsW56JDw6MO",
        roles: ["Owner"],
        outletName: "All Outlets",
        isActive: true,
        pin: "1234",
      },
      { id: "user-manager-1",  fullName: "Priya",  name: "Priya",  roles: ["Manager"],  outletName: "All Outlets",  isActive: true, pin: "2244" },
      { id: "user-captain-1",  fullName: "Karthik",name: "Karthik",roles: ["Captain"],  outletName: "Indiranagar",  isActive: true, pin: "1234" },
      { id: "user-waiter-1",   fullName: "Rahul",  name: "Rahul",  roles: ["Waiter"],   outletName: "Indiranagar",  isActive: true, pin: "2345" },
      { id: "user-waiter-2",   fullName: "Devi",   name: "Devi",   roles: ["Waiter"],   outletName: "Indiranagar",  isActive: true, pin: "3456" },
      { id: "user-cashier-1",  fullName: "Ravi",   name: "Ravi",   roles: ["Cashier"],  outletName: "Indiranagar",  isActive: true, pin: "4321" },
      { id: "user-cashier-2",  fullName: "Sunita", name: "Sunita", roles: ["Cashier"],  outletName: "Indiranagar",  isActive: true, pin: "5678" },
      { id: "user-captain-2",  fullName: "Arjun",  name: "Arjun",  roles: ["Captain"],  outletName: "Koramangala",  isActive: true, pin: "1111" },
      { id: "user-cashier-3",  fullName: "Meena",  name: "Meena",  roles: ["Cashier"],  outletName: "Koramangala",  isActive: true, pin: "2222" },
    ],
    taxProfiles,
    receiptTemplates: [
      { id: "receipt-dine-in",  name: "Dine-In Standard",  showQrPayment: true, showTaxBreakdown: true, footerNote: "Thank you, visit again", outletName: "All Outlets" },
      { id: "receipt-takeaway", name: "Takeaway Standard", showQrPayment: true, showTaxBreakdown: true, footerNote: "Packed with care",      outletName: "All Outlets" },
    ],
    devices: [],
    menu: {
      config: createDefaultMenuConfig(taxProfiles),
      pricingProfiles: createDefaultPricingProfiles(),
      stations: [],  // No demo stations — user creates real stations in Kitchen Stations page
      categories: [
        { id: "cat-starters",    name: "Starters",     itemCount: 2, printerTarget: "Kitchen Printer 1", displayTarget: "Hot Kitchen Display" },
        { id: "cat-main-course", name: "Main Course",  itemCount: 1, printerTarget: "Kitchen Printer 1", displayTarget: "Hot Kitchen Display" },
        { id: "cat-beverages",   name: "Beverages",    itemCount: 1, printerTarget: "Kitchen Printer 1", displayTarget: "Drinks Display"      },
      ],
      items: [
        {
          id: "item-paneer-tikka",
          categoryId: "cat-starters",
          name: "Paneer Tikka",
          station: "",  // Routed via Kitchen Stations → Category mapping
          gstLabel: "GST 5%",
          status: "Live",
          foodType: "Veg",
          badges: ["Area + service pricing","Available","Tracked"],
          salesAvailability: "Available",
          outletAvailability: [{ outlet: "Indiranagar", enabled: true },{ outlet: "Koramangala", enabled: true }],
          inventoryTracking: { enabled: true, mode: "Item wise", note: "Track sellable stock for POS and waiter ordering" },
          pricing: [
            { area: "AC",           dineIn: "Rs 220", takeaway: "Rs 210", delivery: "Rs 230" },
            { area: "Non-AC",       dineIn: "Rs 210", takeaway: "Rs 205", delivery: "Rs 225" },
            { area: "Self Service", dineIn: "Rs 195", takeaway: "Rs 190", delivery: "Rs 215" },
          ],
        },
        {
          id: "item-crispy-corn",
          categoryId: "cat-starters",
          name: "Crispy Corn",
          station: "",
          gstLabel: "GST 5%",
          status: "Live",
          foodType: "Veg",
          badges: ["Area + service pricing","Available"],
          salesAvailability: "Available",
          outletAvailability: [{ outlet: "Indiranagar", enabled: true },{ outlet: "Koramangala", enabled: false }],
          inventoryTracking: { enabled: false, mode: "Optional", note: "Inventory tracking is disabled for this item" },
          pricing: [
            { area: "AC",           dineIn: "Rs 180", takeaway: "Rs 175", delivery: "Rs 195" },
            { area: "Non-AC",       dineIn: "Rs 170", takeaway: "Rs 165", delivery: "Rs 185" },
            { area: "Self Service", dineIn: "Rs 160", takeaway: "Rs 155", delivery: "Rs 175" },
          ],
        },
        {
          id: "item-veg-biryani",
          categoryId: "cat-main-course",
          name: "Veg Biryani",
          station: "",
          gstLabel: "GST 5%",
          status: "Live",
          foodType: "Veg",
          badges: ["Popular","Tracked"],
          salesAvailability: "Available",
          outletAvailability: [{ outlet: "Indiranagar", enabled: true },{ outlet: "Koramangala", enabled: true }],
          inventoryTracking: { enabled: true, mode: "Category wise", note: "Included in opening stock category-wise sales tracking" },
          pricing: [
            { area: "AC",           dineIn: "Rs 240", takeaway: "Rs 230", delivery: "Rs 250" },
            { area: "Non-AC",       dineIn: "Rs 230", takeaway: "Rs 225", delivery: "Rs 245" },
            { area: "Self Service", dineIn: "Rs 220", takeaway: "Rs 215", delivery: "Rs 235" },
          ],
        },
        {
          id: "item-sweet-lime",
          categoryId: "cat-beverages",
          name: "Sweet Lime Soda",
          station: "",
          gstLabel: "GST 5%",
          status: "Live",
          foodType: "Veg",
          badges: ["Available"],
          salesAvailability: "Available",
          outletAvailability: [{ outlet: "Indiranagar", enabled: true },{ outlet: "Koramangala", enabled: true }],
          inventoryTracking: { enabled: false, mode: "Optional later", note: "No stock tracking for beverages in this setup" },
          pricing: [
            { area: "AC",           dineIn: "Rs 90", takeaway: "Rs 85", delivery: "Rs 95" },
            { area: "Non-AC",       dineIn: "Rs 90", takeaway: "Rs 85", delivery: "Rs 95" },
            { area: "Self Service", dineIn: "Rs 90", takeaway: "Rs 85", delivery: "Rs 95" },
          ],
        },
      ],
      menuGroups:      createDefaultMenuGroups(),
      menuAssignments: createDefaultMenuAssignments(outlets),
    },
    discounts: {
      rules:          createDefaultDiscountRules(),
      approvalPolicy: createDefaultDiscountApprovalPolicy(),
      defaults:       createDefaultDiscountDefaults(),
    },
    integrations: createDefaultIntegrations(outlets),
  };
}

function normalizeOwnerSetupData(data) {
  const next = JSON.parse(JSON.stringify(data));
  const defaultPermissions = createDefaultPermissions();
  const defaultRoles       = createDefaultRoles();

  next.devices = next.devices || [];
  next.outlets = (next.outlets || []).map((outlet) => ({
    hours:        "9:00 AM - 11:00 PM",
    services:     ["Dine-in","Takeaway"],
    workAreas:    ["AC","Non-AC","Self Service"],
    tables:       [],
    reportEmail:  "",
    ...outlet,
  }));
  next.permissions = defaultPermissions.map((permission) => {
    const existing = (next.permissions || []).find((item) => item.code === permission.code);
    return existing ? { ...permission, ...existing } : permission;
  });
  next.roles = [
    ...defaultRoles.map((role) => {
      const existing = (next.roles || []).find((item) => item.name === role.name);
      return existing
        ? { ...role, ...existing, permissions: Array.from(new Set([...(existing.permissions || []), ...(role.permissions || [])])) }
        : role;
    }),
    ...(next.roles || []).filter((role) => !defaultRoles.some((dr) => dr.name === role.name)),
  ];
  next.menu = next.menu || { categories: [], items: [] };
  next.menu.config          = next.menu.config          || createDefaultMenuConfig(next.taxProfiles || []);
  next.menu.pricingProfiles = next.menu.pricingProfiles || createDefaultPricingProfiles();
  next.menu.stations = (next.menu.stations || []).map((station) => {
    // Heal seed outlet IDs (e.g. "outlet-indiranagar", "outlet-koramangala") → "all".
    // Seed outlet IDs have letters after "outlet-"; real outlet IDs have digits
    // (e.g. "outlet-17769407770843").  Storing seed IDs on stations causes them to
    // be excluded when the active outlet has a real timestamp-based ID.
    const rawOutletId      = station.outletId || "all";
    const isSeedOutletId   =
      rawOutletId !== "all" &&
      rawOutletId.startsWith("outlet-") &&
      /^[a-z]/.test(rawOutletId.slice("outlet-".length));
    const healedOutletId   = isSeedOutletId ? "all" : rawOutletId;
    if (isSeedOutletId) {
      console.log(`[store] healed station outletId: "${station.name}" ${rawOutletId} → all`);
    }
    return {
      id:         station.id || `station-${String(station.name || "").toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
      name:       station.name,
      outletId:   healedOutletId,
      categories: station.categories || [],
    };
  });

  // ── Self-healing data migration (runs every startup) ────────────────────────
  //
  // PRINCIPLE: Owner Console is the single source of truth.
  // Seed/demo data is detected by ID pattern and cleaned up automatically.
  //
  // ID patterns:
  //   Seed category:  cat-starters, cat-main-course  → letters after "cat-"
  //   Real category:  cat-1748294847723              → digits after "cat-"
  //   Seed item:      item-paneer-tikka              → letters after "item-"
  //   Real item:      item-1748294847723             → digits after "item-"
  //
  // Fixes applied every startup:
  //   A) Remove seed categories when real categories exist (same name, different ID)
  //   B) Keep seed items but HEAL their categoryIds to real IDs by name matching
  //   C) Clear stale station names on items (routing uses category→station only)

  // Seed IDs have a letter immediately after the prefix (slug style).
  // Real IDs have a digit immediately after the prefix (timestamp style).
  const isSeedId = (id, prefix) => {
    const s = String(id || "");
    return s.startsWith(prefix) && /^[a-z]/.test(s.slice(prefix.length));
  };

  const allCats  = next.menu.categories || [];
  const allItems = next.menu.items      || [];

  // SAFE RULE: Never remove any categories — removing them breaks catIdToName lookups
  // in the KOT controller for items that still reference the old ID.
  // Instead, only HEAL item categoryIds to point to the best matching real category.

  // Build lookup maps from ALL categories (seed + real)
  const configuredStationNames = new Set(
    (next.menu.stations || []).map(s => (s.name || "").trim().toLowerCase())
  );
  // category name (lowercase) → most recent real (non-seed) ID for that name
  // Real IDs win over seed IDs so healed items use real UUIDs
  const catNameToRealId = {};
  // First pass: seed categories (lowest priority)
  allCats.filter(c =>  isSeedId(c.id, "cat-")).forEach(c => {
    catNameToRealId[(c.name || "").trim().toLowerCase()] = c.id;
  });
  // Second pass: real categories (overwrite seeds — higher priority)
  allCats.filter(c => !isSeedId(c.id, "cat-")).forEach(c => {
    catNameToRealId[(c.name || "").trim().toLowerCase()] = c.id;
  });
  const hasRealCategories = allCats.some(c => !isSeedId(c.id, "cat-"));
  // All category IDs (seed + real) — used to detect truly unknown IDs
  const allCatIds = new Set(allCats.map(c => String(c.id)));

  // Heal item categoryIds + clear stale station names
  next.menu.items = allItems.map((item) => {
    let healed = { ...item };

    // Clear stale station name — routing is category→station only
    const st = (healed.station || "").trim();
    if (st && !configuredStationNames.has(st.toLowerCase())) {
      healed.station = "";
    }

    // Heal seed-slug categoryId → real category ID when real categories exist.
    // e.g. "cat-main-course" → derive "main course" → find real "Main Course" UUID.
    // This makes Step-2 routing (catIdToStation) work for seed items.
    const catId = String(healed.categoryId || "");
    const needsHeal = catId && hasRealCategories && isSeedId(catId, "cat-");
    if (needsHeal) {
      const derivedName = catId.replace(/^cat-/, "").replace(/-/g, " ").toLowerCase();
      const realId =
        catNameToRealId[derivedName] ||
        catNameToRealId[(healed.categoryName || "").trim().toLowerCase()] ||
        catNameToRealId[(healed.category     || "").trim().toLowerCase()];
      if (realId && !isSeedId(realId, "cat-")) {
        console.log(`[store] healed categoryId: item="${healed.name}" ${catId} → ${realId}`);
        healed.categoryId = realId;
      }
    }

    return healed;
  });

  next.menu.categories = (next.menu.categories || []).map((category) => ({
    printerTarget: category.printerTarget || "Kitchen Printer 1",
    displayTarget: category.displayTarget || "Hot Kitchen Display",
    ...category,
    // Never fall back to a hardcoded station name — routing is via Kitchen Stations → Category mapping
    station: category.station || "",
  }));
  next.menu.menuGroups = (next.menu.menuGroups || createDefaultMenuGroups()).map((menuGroup) => ({
    status:       "Live",
    categoryIds:  [],
    channels:     "Dine-In, Takeaway",
    availability: "Always on",
    note:         "",
    ...menuGroup,
  }));
  next.menu.menuAssignments = (next.menu.menuAssignments || createDefaultMenuAssignments(next.outlets || [])).map((a) => ({
    channels:     "Dine-In, Takeaway",
    availability: "Always on",
    status:       "Ready",
    ...a,
  }));
  next.discounts = next.discounts || {};
  next.discounts.rules = (next.discounts.rules || createDefaultDiscountRules()).map((rule) => ({
    discountType:    "percentage",
    discountScope:   "order",
    value:           0,
    outletScope:     "All Outlets",
    appliesToRole:   "Cashier",
    requiresApproval: false,
    timeWindow:      "Always on",
    isActive:        true,
    notes:           "",
    ...rule,
  }));
  next.discounts.approvalPolicy = (next.discounts.approvalPolicy || createDefaultDiscountApprovalPolicy())
    .filter((row) => row.role !== "Captain")
    .map((row) => ({
      manualDiscountLimit: 0,
      orderVoid:           "Not allowed",
      billDelete:          "Not allowed",
      approvalRoute:       "Owner approval",
      status:              "Protected",
      ...row,
    }));
  next.discounts.defaults = { ...createDefaultDiscountDefaults(), ...(next.discounts.defaults || {}) };
  next.integrations = next.integrations || createDefaultIntegrations(next.outlets || []);
  next.integrations.zohoBooks = {
    ...createDefaultIntegrations(next.outlets || []).zohoBooks,
    ...(next.integrations.zohoBooks || {}),
  };
  next.integrations.accountMapping = {
    ...createDefaultIntegrations(next.outlets || []).accountMapping,
    ...(next.integrations.accountMapping || {}),
  };
  next.integrations.outletMappings  = next.integrations.outletMappings  || createDefaultIntegrations(next.outlets || []).outletMappings;
  next.integrations.vendorMappings  = next.integrations.vendorMappings  || [];
  next.integrations.purchaseEntries = next.integrations.purchaseEntries || [];
  next.integrations.syncLog         = next.integrations.syncLog         || [];

  return next;
}
