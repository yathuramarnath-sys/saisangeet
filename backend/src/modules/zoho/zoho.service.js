/**
 * zoho.service.js
 *
 * Zoho Books API integration — India region.
 * Docs: https://www.zoho.com/books/api/v3/
 *
 * Auth: OAuth 2.0 (authorization_code + refresh_token)
 * Base: https://www.zohoapis.in/books/v3
 *
 * Flow per tenant:
 *   1. Owner enters clientId + clientSecret in Owner Console
 *   2. We build an auth URL → owner clicks → Zoho redirects back with code
 *   3. We exchange code for accessToken + refreshToken → stored in ownerSetupData.zoho
 *   4. Every API call: check expiresAt, refresh if needed, then call
 *   5. On closed-order → pushSaleReceipt() (fire-and-forget)
 */

const https  = require("https");
const qs     = require("querystring");

const ZOHO_ACCOUNTS = "accounts.zoho.in";
const ZOHO_API_BASE = "www.zohoapis.in";
const BOOKS_PATH    = "/books/v3";

// SAC code for restaurant dine-in services (India)
const RESTAURANT_SAC = "996331";

// ─────────────────────────────────────────────────────────────────────────────
// HTTP helpers
// ─────────────────────────────────────────────────────────────────────────────

function httpsRequest(hostname, method, path, body, headers) {
  return new Promise((resolve, reject) => {
    const payload = body
      ? (typeof body === "string" ? body : JSON.stringify(body))
      : null;
    const opts = {
      hostname,
      path,
      method,
      headers: {
        ...(payload && typeof body !== "string"
          ? { "Content-Type": "application/json" }
          : { "Content-Type": "application/x-www-form-urlencoded" }),
        ...(payload ? { "Content-Length": Buffer.byteLength(payload) } : {}),
        ...headers,
      },
    };
    const req = https.request(opts, res => {
      let data = "";
      res.on("data", c => { data += c; });
      res.on("end", () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// OAuth helpers
// ─────────────────────────────────────────────────────────────────────────────

const SCOPES = [
  "ZohoBooks.salesreceipts.CREATE",
  "ZohoBooks.salesreceipts.READ",
  "ZohoBooks.contacts.CREATE",
  "ZohoBooks.contacts.READ",
  "ZohoBooks.settings.READ",
].join(",");

/**
 * Build the Zoho OAuth authorization URL.
 * state = tenantId so the callback can route tokens to the right tenant.
 */
function buildAuthUrl(clientId, redirectUri, tenantId) {
  const params = qs.stringify({
    client_id:     clientId,
    response_type: "code",
    redirect_uri:  redirectUri,
    scope:         SCOPES,
    access_type:   "offline",
    prompt:        "consent",
    state:         tenantId,
  });
  return `https://${ZOHO_ACCOUNTS}/oauth/v2/auth?${params}`;
}

/**
 * Exchange authorization code for tokens.
 */
async function exchangeCode(clientId, clientSecret, code, redirectUri) {
  const body = qs.stringify({
    grant_type:    "authorization_code",
    client_id:     clientId,
    client_secret: clientSecret,
    redirect_uri:  redirectUri,
    code,
  });
  const result = await httpsRequest(
    ZOHO_ACCOUNTS, "POST", "/oauth/v2/token", body, {}
  );
  if (!result.body?.access_token) {
    throw new Error(
      result.body?.error || result.body?.message || "Zoho token exchange failed"
    );
  }
  return {
    accessToken:  result.body.access_token,
    refreshToken: result.body.refresh_token,
    expiresAt:    Date.now() + (result.body.expires_in - 60) * 1000, // 60s safety margin
    apiDomain:    result.body.api_domain || "https://www.zohoapis.in",
  };
}

/**
 * Refresh an expired access token.
 * Returns { accessToken, expiresAt }.
 */
async function refreshAccessToken(clientId, clientSecret, refreshToken) {
  const body = qs.stringify({
    grant_type:    "refresh_token",
    client_id:     clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
  });
  const result = await httpsRequest(
    ZOHO_ACCOUNTS, "POST", "/oauth/v2/token", body, {}
  );
  if (!result.body?.access_token) {
    throw new Error(
      result.body?.error || result.body?.message || "Zoho token refresh failed"
    );
  }
  return {
    accessToken: result.body.access_token,
    expiresAt:   Date.now() + (result.body.expires_in - 60) * 1000,
  };
}

/**
 * Get a valid access token — refreshes automatically if expired.
 * Mutates cfg in place and returns { accessToken, cfg }.
 * Caller must persist the updated cfg to ownerSetupData.
 */
async function getValidToken(cfg) {
  if (!cfg?.refreshToken) throw new Error("Zoho not connected. Reconnect in Integrations.");
  if (Date.now() < (cfg.expiresAt || 0)) {
    return { accessToken: cfg.accessToken, refreshed: false };
  }
  const refreshed = await refreshAccessToken(cfg.clientId, cfg.clientSecret, cfg.refreshToken);
  cfg.accessToken = refreshed.accessToken;
  cfg.expiresAt   = refreshed.expiresAt;
  return { accessToken: refreshed.accessToken, refreshed: true, cfg };
}

// ─────────────────────────────────────────────────────────────────────────────
// Books API helpers
// ─────────────────────────────────────────────────────────────────────────────

async function booksGet(path, organizationId, accessToken) {
  const sep = path.includes("?") ? "&" : "?";
  return httpsRequest(
    ZOHO_API_BASE, "GET",
    `${BOOKS_PATH}${path}${sep}organization_id=${organizationId}`,
    null,
    { Authorization: `Zoho-oauthtoken ${accessToken}` }
  );
}

async function booksPost(path, body, organizationId, accessToken) {
  return httpsRequest(
    ZOHO_API_BASE, "POST",
    `${BOOKS_PATH}${path}?organization_id=${organizationId}`,
    body,
    { Authorization: `Zoho-oauthtoken ${accessToken}` }
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Organization lookup (called once after OAuth connect)
// ─────────────────────────────────────────────────────────────────────────────

async function getOrganizations(accessToken) {
  const result = await httpsRequest(
    ZOHO_API_BASE, "GET", `${BOOKS_PATH}/organizations`,
    null,
    { Authorization: `Zoho-oauthtoken ${accessToken}` }
  );
  if (result.body?.code !== 0) {
    throw new Error(result.body?.message || "Could not fetch Zoho organizations");
  }
  return result.body.organizations || [];
}

// ─────────────────────────────────────────────────────────────────────────────
// Walk-in Customer — create once, cache contact_id
// ─────────────────────────────────────────────────────────────────────────────

async function getOrCreateWalkInContact(organizationId, accessToken) {
  // Check if a "Walk-in Customer" contact already exists
  const search = await booksGet(
    "/contacts?contact_type=customer&search_text=Walk-in+Customer",
    organizationId, accessToken
  );
  const existing = search.body?.contacts?.find(
    c => c.contact_name === "Walk-in Customer"
  );
  if (existing) return existing.contact_id;

  // Create one
  const result = await booksPost("/contacts", {
    contact_name:       "Walk-in Customer",
    contact_type:       "customer",
    customer_sub_type:  "individual",
    gst_treatment:      "consumer",
  }, organizationId, accessToken);

  if (result.body?.code !== 0) {
    throw new Error(result.body?.message || "Could not create walk-in contact");
  }
  return result.body.contact.contact_id;
}

// ─────────────────────────────────────────────────────────────────────────────
// Map POS payment method → Zoho payment_mode
// ─────────────────────────────────────────────────────────────────────────────

function mapPaymentMode(methods) {
  if (!methods?.length) return "cash";
  const primary = methods[0]?.method || "cash";
  const map = {
    cash:    "cash",
    card:    "creditcard",
    upi:     "others",
    phonepe: "others",
    zomato:  "others",
    swiggy:  "others",
  };
  return map[primary.toLowerCase()] || "cash";
}

// ─────────────────────────────────────────────────────────────────────────────
// Push a closed POS order as a Zoho Books Sales Receipt
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @param {object} order     — closed POS order (from operations.controller)
 * @param {object} zohoCfg   — tenant's zoho config from ownerSetupData
 * @param {object} taxMap    — { "5": zohoTaxId, "12": zohoTaxId, "18": zohoTaxId }
 *                             (pre-fetched once, cached in zohoCfg.taxMap)
 * @returns {{ receiptId, receiptNumber }}
 */
async function pushSaleReceipt(order, zohoCfg, taxMap) {
  const { accessToken } = await getValidToken(zohoCfg);
  const orgId   = zohoCfg.organizationId;
  const custId  = zohoCfg.walkInContactId;
  const stateCode = zohoCfg.stateCode || "TN"; // restaurant's state for place_of_supply

  // Receipt number — use orderId/billNo for idempotency
  const receiptNumber = `SR-${order.billNo || order.orderNumber}`;

  // Date — use closedAt or today
  const closedDate = order.closedAt
    ? order.closedAt.slice(0, 10)
    : new Date().toISOString().slice(0, 10);

  // Build line items
  const billableItems = (order.items || []).filter(i => !i.isVoided && !i.isComp);
  const line_items = billableItems.map(item => {
    const taxRate   = item.taxRate != null && item.taxRate !== "" ? Number(item.taxRate) : 5;
    const taxId     = (taxMap && taxMap[String(taxRate)]) || undefined;
    const lineItem  = {
      name:       item.name,
      description: item.note || "",
      rate:        Number(item.price),
      quantity:    item.quantity,
      unit:        "Nos",
      hsn_or_sac:  RESTAURANT_SAC,
    };
    if (taxId) lineItem.tax_id = taxId;
    return lineItem;
  });

  // Discount — Zoho supports discount at receipt level
  const subtotal   = billableItems.reduce((s, i) => s + i.price * i.quantity, 0);
  const discountAmt = Math.min(order.discountAmount || 0, subtotal);

  const payload = {
    customer_id:      custId,
    receipt_number:   receiptNumber,
    date:             closedDate,
    payment_mode:     mapPaymentMode(order.payments),
    place_of_supply:  stateCode,
    gst_treatment:    "consumer",
    is_inclusive_tax: false,
    notes:            order.tableLabel || order.areaName
      ? `${order.areaName || ""} — Table ${order.tableNumber || ""} | ${order.cashierName || "POS"}`
      : `Order #${order.orderNumber} | ${order.cashierName || "POS"}`,
    line_items,
    ...(discountAmt > 0 ? {
      discount:         discountAmt.toFixed(2),
      is_discount_before_tax: true,
    } : {}),
  };

  const result = await booksPost("/salesreceipts", payload, orgId, accessToken);

  // code 0 = success, code 1004 = duplicate (already pushed) — both are OK
  if (result.body?.code === 1004) {
    console.log(`[zoho] already pushed | receipt=${receiptNumber}`);
    return { receiptNumber, alreadyExists: true };
  }
  if (result.body?.code !== 0) {
    throw new Error(
      result.body?.message ||
      `Zoho push failed: ${JSON.stringify(result.body)}`
    );
  }

  const receipt = result.body.salesreceipt;
  console.log(`[zoho] pushed | receipt=${receiptNumber} | id=${receipt.sales_receipt_id}`);
  return {
    receiptId:     receipt.sales_receipt_id,
    receiptNumber: receipt.receipt_number,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Fetch Zoho tax IDs — called once after connect, cached in zohoCfg.taxMap
// Returns { "5": "taxId_5", "12": "taxId_12", "18": "taxId_18" }
// ─────────────────────────────────────────────────────────────────────────────

async function fetchTaxMap(organizationId, accessToken) {
  const result = await booksGet("/settings/taxes", organizationId, accessToken);
  const taxes  = result.body?.taxes || [];
  const map    = {};
  for (const t of taxes) {
    const pct = String(Math.round(t.tax_percentage));
    if (!map[pct]) map[pct] = t.tax_id; // first match wins
  }
  return map;
}

module.exports = {
  buildAuthUrl,
  exchangeCode,
  getValidToken,
  refreshAccessToken,
  getOrganizations,
  getOrCreateWalkInContact,
  fetchTaxMap,
  pushSaleReceipt,
};
