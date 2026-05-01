/**
 * whatsapp.service.js
 * Bring-Your-Own-Twilio WhatsApp bill delivery.
 *
 * Each tenant stores their own Twilio credentials in tenant JSON.
 * Plato does NOT own or pay for any Twilio account.
 *
 * Flow:
 *   1. Tenant enters Twilio Account SID + Auth Token + WhatsApp sender number
 *      in Settings → Integrations → WhatsApp Bills
 *   2. Those creds are saved to their tenant data JSON
 *   3. On bill payment the POS calls POST /whatsapp/send-bill
 *   4. This service builds the bill message and sends it via that tenant's Twilio account
 */

const twilio = require("twilio");
const { getOwnerSetupData, updateOwnerSetupData } = require("../../data/owner-setup-store");
const { getOrderById } = require("../operations/closed-orders-store");

// ── Config helpers ────────────────────────────────────────────────────────────

function getConfig() {
  const data = getOwnerSetupData();
  return data.integrations?.whatsapp || {};
}

/** Returns config with auth token masked — safe to send to frontend */
function getMaskedConfig() {
  const c = getConfig();
  if (!c.accountSid) return { connected: false };
  return {
    connected:   !!(c.accountSid && c.authToken && c.fromNumber),
    accountSid:  c.accountSid || "",
    authToken:   c.authToken  ? "••••••••" + c.authToken.slice(-4) : "",
    fromNumber:  c.fromNumber || "",
    enabled:     c.enabled !== false,
  };
}

/** Save Twilio credentials to tenant data. Partial update allowed. */
function saveConfig(payload) {
  updateOwnerSetupData((current) => {
    const existing = current.integrations?.whatsapp || {};
    return {
      ...current,
      integrations: {
        ...(current.integrations || {}),
        whatsapp: {
          accountSid: (payload.accountSid  !== undefined && payload.accountSid  !== "") ? payload.accountSid  : existing.accountSid  || "",
          // Never overwrite stored authToken with an empty string — frontend omits it when not changing
          authToken:  (payload.authToken   !== undefined && payload.authToken   !== "") ? payload.authToken   : existing.authToken   || "",
          fromNumber: (payload.fromNumber  !== undefined && payload.fromNumber  !== "") ? payload.fromNumber  : existing.fromNumber  || "",
          enabled:     payload.enabled     !== undefined ? Boolean(payload.enabled) : (existing.enabled !== false),
        },
      },
    };
  });
  return getMaskedConfig();
}

// ── Twilio client (per-request, uses tenant's own creds) ─────────────────────

function getClient() {
  const c = getConfig();
  if (!c.accountSid || !c.authToken) {
    throw new Error(
      "Twilio credentials not set. Add Account SID and Auth Token in Settings → Integrations → WhatsApp Bills."
    );
  }
  return twilio(c.accountSid, c.authToken);
}

// ── Phone number normalisation ────────────────────────────────────────────────

/**
 * Normalises a customer phone to the WhatsApp E.164 format Twilio expects.
 * Supports: 10-digit Indian, +91XXXXXXXXXX, or any E.164.
 */
function normalizeToPhone(phone) {
  const str = String(phone || "");
  // Already in Twilio's whatsapp: format — return as-is
  if (str.startsWith("whatsapp:")) return str;
  const digits = str.replace(/\D/g, "");
  if (digits.length === 10) return `whatsapp:+91${digits}`;
  if (digits.length === 12 && digits.startsWith("91")) return `whatsapp:+${digits}`;
  // Full E.164 without country code ambiguity (e.g. +1-555-..., +44-...)
  if (digits.length >= 13) return `whatsapp:+${digits}`;
  // 11-digit or other unknown lengths — reject with a clear message
  throw new Error(`Invalid phone number: "${phone}". Enter a 10-digit Indian mobile number or full E.164 format.`);
}

/**
 * Normalises the sender number stored in config.
 * Supports Twilio sandbox format, plain E.164, or already-prefixed.
 */
function normalizeFromPhone(from) {
  if (!from) throw new Error("WhatsApp sender number not configured. Add it in Integrations → WhatsApp Bills.");
  if (from.startsWith("whatsapp:")) return from;
  const digits = from.replace(/\D/g, "");
  return `whatsapp:+${digits}`;
}

// ── Bill message builder ──────────────────────────────────────────────────────

function buildBillMessage(order, businessProfile) {
  const biz    = businessProfile || {};
  const bName  = biz.tradeName || biz.legalName || "Restaurant";
  const bPhone = biz.phone || "";

  // Item lines
  const itemLines = (order.items || order.orderItems || [])
    .map((it) => {
      const qty   = Number(it.quantity || it.qty || 1);
      const price = Number(it.price || it.unitPrice || 0) * qty;
      return `  • ${it.name || it.itemName}  x${qty}  —  ₹${price.toFixed(2)}`;
    });

  const subtotal = Number(order.subtotal || order.subTotal || 0).toFixed(2);
  const taxAmt   = Number(order.taxAmount || order.tax || 0).toFixed(2);
  const total    = Number(order.totalAmount || order.total || order.grandTotal || 0).toFixed(2);
  const method   = (order.payments || [])[0]?.method
                || (order.payments || [])[0]?.label
                || order.paymentMethod
                || "Cash";
  const table    = order.tableLabel || order.tableName || order.tableNumber || "";
  const billNo   = order.billNo || order.billNumber || String(order.id || "").slice(-6).toUpperCase();

  const lines = [
    `🧾 *Bill — ${bName}*`,
    table ? `Table: ${table}  |  Bill #${billNo}` : `Bill #${billNo}`,
    ``,
    ...(itemLines.length ? itemLines : [`  (no items)`]),
    ``,
    `──────────────────`,
    `Subtotal:   ₹${subtotal}`,
    taxAmt !== "0.00" ? `Tax:        ₹${taxAmt}` : null,
    `*Total:     ₹${total}*`,
    ``,
    `Paid via ${method} ✅`,
    ``,
    `Thank you for dining with us! 🙏`,
    bPhone ? `_${bName}  |  ${bPhone}_` : `_${bName}_`,
  ].filter((l) => l !== null);

  return lines.join("\n");
}

// ── Send functions ────────────────────────────────────────────────────────────

/**
 * Send a bill for a specific closed order to the given phone number.
 * @param {string} tenantId  — from req.user.tenantId
 * @param {string} orderId
 * @param {string} outletId  — optional, speeds up lookup
 * @param {string} phone     — customer's mobile number
 */
async function sendBill({ tenantId, orderId, outletId, phone }) {
  const c = getConfig();
  if (!c.accountSid || !c.authToken || !c.fromNumber) {
    throw new Error("WhatsApp not configured. Add Twilio credentials in Settings → Integrations.");
  }

  // Find order in closed orders store
  const order = getOrderById(tenantId, orderId, outletId || null);
  if (!order) throw new Error(`Order "${orderId}" not found in closed orders.`);

  const data    = getOwnerSetupData();
  const message = buildBillMessage(order, data.businessProfile);

  const client = getClient();
  const result = await client.messages.create({
    from: normalizeFromPhone(c.fromNumber),
    to:   normalizeToPhone(phone),
    body: message,
  });

  return { ok: true, sid: result.sid, status: result.status };
}

/**
 * Send a test "you're connected!" message to the owner's phone.
 * Used to verify credentials work before going live.
 */
async function sendTest({ phone }) {
  const c = getConfig();
  if (!c.accountSid || !c.authToken || !c.fromNumber) {
    throw new Error("Twilio credentials not configured. Fill in Account SID, Auth Token, and sender number first.");
  }

  const data  = getOwnerSetupData();
  const bName = data.businessProfile?.tradeName || data.businessProfile?.legalName || "Your Restaurant";

  const client = getClient();
  const result = await client.messages.create({
    from: normalizeFromPhone(c.fromNumber),
    to:   normalizeToPhone(phone),
    body: [
      `✅ *WhatsApp Bills are live for ${bName}!*`,
      ``,
      `Your customers will now receive digital bills on WhatsApp after every payment. 🧾`,
      ``,
      `_Powered by Plato POS_`,
    ].join("\n"),
  });

  return { ok: true, sid: result.sid, status: result.status };
}

module.exports = {
  getMaskedConfig,
  saveConfig,
  sendBill,
  sendTest,
};
