/**
 * sms.js — MSG91 SMS utility for Plato POS
 *
 * Sends a shift-close sales summary SMS to the outlet's registered phone number.
 * Uses MSG91 Flow API (transactional SMS).
 */

const { env } = require("../config/env");

const MSG91_AUTH_KEY = process.env.MSG91_AUTH_KEY || "";
const MSG91_SENDER   = process.env.MSG91_SENDER   || "PLATOS";

/**
 * Send a plain-text SMS via MSG91.
 * @param {string} to   — mobile number with country code, no + (e.g. "919876543210")
 * @param {string} message — SMS text (max 160 chars for single SMS)
 */
async function sendSms(to, message) {
  if (!MSG91_AUTH_KEY) {
    console.warn("[sms] MSG91_AUTH_KEY not set — skipping SMS");
    return { ok: false, reason: "not_configured" };
  }

  // Normalise number — strip +, spaces, dashes
  const mobile = String(to || "").replace(/[\s\+\-]/g, "");
  if (!mobile || mobile.length < 10) {
    console.warn("[sms] Invalid mobile number:", to);
    return { ok: false, reason: "invalid_number" };
  }

  try {
    const res = await fetch("https://api.msg91.com/api/v5/flow/", {
      method:  "POST",
      headers: {
        "authkey":      MSG91_AUTH_KEY,
        "Content-Type": "application/json",
        "accept":       "application/json",
      },
      body: JSON.stringify({
        // Using simple SMS API (no template needed for transactional alerts)
        sender:  MSG91_SENDER,
        route:   "4",           // 4 = transactional
        country: "91",
        sms: [{
          message,
          to: [mobile],
        }],
      }),
    });

    const data = await res.json().catch(() => ({}));
    if (res.ok || data?.type === "success") {
      console.log(`[sms] Sent to ${mobile} ✓`);
      return { ok: true };
    }
    console.warn("[sms] MSG91 error:", data);
    return { ok: false, reason: data?.message || "msg91_error" };
  } catch (err) {
    console.warn("[sms] Network error:", err.message);
    return { ok: false, reason: err.message };
  }
}

/**
 * Build and send a shift-close sales summary SMS.
 *
 * @param {object} params
 * @param {object} params.shift       — closed shift object
 * @param {string} params.outletName  — restaurant / outlet name
 * @param {string} params.phone       — owner's mobile number
 * @param {Array}  params.closedOrders — orders closed during this shift
 */
async function sendShiftCloseSms({ shift, outletName, phone, closedOrders = [] }) {
  if (!phone) {
    console.warn("[sms] No phone number for outlet — skipping shift SMS");
    return;
  }

  // ── Calculate totals from closed orders ──────────────────────────────────
  const orders  = closedOrders.filter(o => o.isClosed);
  const count   = orders.length;
  const total   = orders.reduce((s, o) => s + (o.total || 0), 0);
  const cash    = orders.reduce((s, o) =>
    s + (o.payments || []).filter(p => p.method === "cash").reduce((a, p) => a + p.amount, 0), 0);
  const upi     = orders.reduce((s, o) =>
    s + (o.payments || []).filter(p => p.method === "upi").reduce((a, p) => a + p.amount, 0), 0);
  const card    = orders.reduce((s, o) =>
    s + (o.payments || []).filter(p => p.method === "card").reduce((a, p) => a + p.amount, 0), 0);
  const credit  = orders.reduce((s, o) =>
    s + (o.payments || []).filter(p => p.method === "credit").reduce((a, p) => a + p.amount, 0), 0);

  const cashierName = shift?.cashierName || shift?.openedBy || "Cashier";
  const now = new Date();
  const timeStr = now.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
  const dateStr = now.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });

  // ── Build SMS (keep under 160 chars for single SMS) ───────────────────────
  const lines = [
    `${outletName} - Shift Closed`,
    `${dateStr}, ${timeStr} | ${cashierName}`,
    `Orders: ${count} | Total: Rs.${Math.round(total)}`,
    cash   > 0 ? `Cash: Rs.${Math.round(cash)}`   : null,
    upi    > 0 ? `UPI: Rs.${Math.round(upi)}`     : null,
    card   > 0 ? `Card: Rs.${Math.round(card)}`   : null,
    credit > 0 ? `Credit: Rs.${Math.round(credit)}` : null,
    `-Plato POS`,
  ].filter(Boolean);

  const message = lines.join("\n");
  await sendSms(phone, message);
}

module.exports = { sendSms, sendShiftCloseSms };
