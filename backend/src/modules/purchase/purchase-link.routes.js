/**
 * Plato Purchase & Expenses — links (separate app, separate database).
 *
 *  POST /api/v1/purchase/sso-ticket          owner console → opens Purchase already logged in
 *  GET  /api/v1/partner/purchase/sales       month's net sales per outlet (for food cost %)
 *  GET  /api/v1/partner/purchase/cash-outs   POS Cash Outs since a time (filed into expenses)
 *
 * The partner routes are called by the Purchase SERVER only, with a 60-second token
 * signed with the shared secret (PLATO_LINK_SECRET, or ATTENDANCE_SSO_SECRET when not
 * set). The token names the restaurant; every read runs inside that restaurant only.
 *
 * Read-only: nothing here changes POS data. Billing code is not touched.
 */

const crypto = require("crypto");
const express = require("express");
const jwt = require("jsonwebtoken");

const { env } = require("../../config/env");
const { requireAuth } = require("../../middleware/require-auth");
const { asyncHandler } = require("../../utils/async-handler");
const { ApiError } = require("../../utils/api-error");
const { getOwnerSetupData } = require("../../data/owner-setup-store");
const { runWithTenant } = require("../../data/tenant-context");
const { isDatabaseEnabled } = require("../../db/database-mode");
const { queryClosedOrders } = require("../../db/closed-orders.repository");
const { getSalesForRange } = require("../operations/closed-orders-store");
const { getShifts } = require("../operations/shifts-store");

const TICKET_SECONDS = 120;

const linkSecret = () => env.platoLinkSecret || env.attendanceSsoSecret;

// ── Owner console: open Purchase ───────────────────────────────────────────────

const purchaseRouter = express.Router();

purchaseRouter.post(
  "/sso-ticket",
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!linkSecret() || !env.purchaseAppUrl) {
      throw new ApiError(503, "PURCHASE_NOT_CONFIGURED", "Purchase is not set up yet");
    }
    if (!(req.user.roles || []).includes("Owner")) {
      throw new ApiError(403, "OWNER_ONLY", "Only the owner can open Purchase from here");
    }
    const data = getOwnerSetupData();
    const user = (data.users || []).find((u) => u.id === req.user.sub) || {};
    const bp = data.businessProfile || {};
    const outlets = (data.outlets || [])
      .filter((o) => o.isActive !== false)
      .map((o) => ({ id: String(o.id), name: String(o.name || "Outlet").slice(0, 80) }));
    const ticket = jwt.sign(
      {
        tenantId: String(req.user.tenantId),
        userId: String(req.user.sub || ""),
        email: user.email || null,
        name: user.fullName || req.user.fullName || "Owner",
        businessName: bp.tradeName || bp.legalName || "My Restaurant",
        outlets
      },
      linkSecret(),
      { algorithm: "HS256", issuer: "dinexpos", audience: "plato-purchase", expiresIn: TICKET_SECONDS, jwtid: crypto.randomUUID() }
    );
    const base = env.purchaseAppUrl.replace(/\/$/, "");
    // Ticket in the URL fragment (#): browsers never send it to servers or logs.
    res.json({ url: `${base}/sso#ticket=${encodeURIComponent(ticket)}` });
  })
);

// ── Server-to-server (Purchase server only) ────────────────────────────────────

const partnerRouter = express.Router();

/** Verify the link token, then run the handler inside that restaurant's data only. */
function partner(handler) {
  return asyncHandler(async (req, res) => {
    if (!linkSecret()) throw new ApiError(503, "PURCHASE_NOT_CONFIGURED", "Purchase link is not set up");
    const m = (req.headers.authorization || "").match(/^Bearer (.+)$/);
    let claims;
    try {
      claims = jwt.verify(m ? m[1] : "", linkSecret(), { algorithms: ["HS256"], issuer: "plato-purchase", audience: "dinexpos-partner", maxAge: "2m" });
    } catch (_err) {
      throw new ApiError(401, "INVALID_LINK_TOKEN", "Invalid link token");
    }
    const tenantId = typeof claims.tenantId === "string" ? claims.tenantId : "";
    if (!tenantId || tenantId === "default" || tenantId.length > 100) throw new ApiError(401, "INVALID_LINK_TOKEN", "Invalid link token");
    await new Promise((resolve, reject) => {
      runWithTenant(tenantId, () => {
        Promise.resolve(handler(req, res, tenantId)).then(resolve, reject);
      });
    });
  });
}

const monthRe = /^\d{4}-(0[1-9]|1[0-2])$/;

/** Closed orders of a date range (same sources as Reports: Postgres + today's memory). */
async function ordersForRange(tenantId, from, to) {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  if (!isDatabaseEnabled()) return getSalesForRange(tenantId, from, to, null);
  if (from >= today) return getSalesForRange(tenantId, from, to, null);
  const pg = await queryClosedOrders(tenantId, { dateFrom: from, dateTo: to, outletId: null });
  if (to < today) return pg;
  const ids = new Set(pg.map((o) => o.id).filter(Boolean));
  return [...getSalesForRange(tenantId, today, today, null).filter((o) => o.id && !ids.has(o.id)), ...pg];
}

/**
 * Net sales WITHOUT GST per outlet for a month (prices include GST, as on the bill):
 * items (not voided) − discount − GST inside the price. Same maths as the owner reports.
 */
partnerRouter.get(
  "/sales",
  partner(async (req, res, tenantId) => {
    const month = String(req.query.month || "");
    if (!monthRe.test(month)) throw new ApiError(400, "BAD_MONTH", "month must be YYYY-MM");
    const [y, m] = month.split("-").map(Number);
    const from = `${month}-01`;
    const to = `${month}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, "0")}`;
    const outlets = (getOwnerSetupData().outlets || []).map((o) => ({ id: String(o.id), name: String(o.name || "") }));
    const byName = new Map(outlets.map((o) => [o.name.toLowerCase(), o.id]));
    const orders = await ordersForRange(tenantId, from, to);
    const byOutlet = {};
    const gross = {};
    let unknown = 0;
    for (const order of orders) {
      const items = (order.items || []).filter((i) => !i.isVoided);
      const sub = items.reduce((s, i) => s + (i.price || 0) * (i.quantity || 1), 0);
      const net = sub - Math.min(order.discountAmount || 0, sub);
      let tax = 0;
      for (const item of items) {
        const rate = item.taxRate != null && item.taxRate !== "" ? Number(item.taxRate) : 5;
        const line = sub > 0 ? (item.price || 0) * (item.quantity || 1) * (net / sub) : 0;
        tax += rate > 0 ? (line * rate) / (100 + rate) : 0;
      }
      const outletId = String(order.outletId || order._outletId || order.outlet_id || byName.get(String(order.outletName || "").toLowerCase()) || "");
      if (!outletId) {
        unknown += net - tax;
        continue;
      }
      byOutlet[outletId] = (byOutlet[outletId] || 0) + (net - tax);
      gross[outletId] = (gross[outletId] || 0) + net;
    }
    const round = (n) => Math.round(n * 100) / 100;
    res.json({
      month,
      basis: "net sales without GST",
      byOutlet: Object.fromEntries(Object.entries(byOutlet).map(([k, v]) => [k, round(v)])),
      withGst: Object.fromEntries(Object.entries(gross).map(([k, v]) => [k, round(v)])),
      unknownOutlet: round(unknown),
      total: round(Object.values(byOutlet).reduce((t, v) => t + v, 0) + unknown),
      orders: orders.length
    });
  })
);

/** POS Cash Outs (not Cash In) since a time. */
partnerRouter.get(
  "/cash-outs",
  partner(async (req, res, tenantId) => {
    const since = Date.parse(String(req.query.since || ""));
    if (Number.isNaN(since)) throw new ApiError(400, "BAD_SINCE", "since must be a date-time");
    const outlets = (getOwnerSetupData().outlets || []).map((o) => ({ id: String(o.id), name: String(o.name || "") }));
    const byName = new Map(outlets.map((o) => [o.name.toLowerCase(), o.id]));
    const { movements } = getShifts(tenantId);
    const cashOuts = (movements || [])
      .filter((mv) => mv && mv.type === "out" && mv.id && Number(mv.amount) > 0 && Date.parse(mv.time) >= since)
      .map((mv) => ({
        id: String(mv.id),
        outletId: byName.get(String(mv.outlet || "").toLowerCase()) || null,
        outletName: mv.outlet || null,
        amount: Number(mv.amount),
        reason: mv.reason || null,
        notes: mv.notes || null,
        cashier: mv.cashier || null,
        time: mv.time
      }));
    res.json({ cashOuts });
  })
);

module.exports = { purchaseRouter, partnerRouter };
