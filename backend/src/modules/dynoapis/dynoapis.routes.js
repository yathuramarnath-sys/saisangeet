/**
 * dynoapis.routes.js
 *
 * Public webhook receiver for Dyno APIs (Swiggy/Zomato aggregator partner,
 * same role as UrbanPiper). Dyno has no auth on these calls — the only trust
 * boundary is that this URL is registered privately as Dyno's "Cloud Webhook
 * Host URL". We add our own defensive checks since Dyno's spec has none:
 * every resId must map to a known outlet, and malformed payloads are
 * rejected and logged rather than silently accepted.
 *
 * Order-receiving phase only (per scope decision) — accept/ready/reject
 * actions taken in the POS are not yet reported back to Dyno's polling
 * endpoint; that's the next phase once this is verified live.
 *
 * Mounted at /webhooks/dynoapis in app.js:
 *   GET  /webhooks/dynoapis/status
 *   POST /webhooks/dynoapis/orders
 *   GET  /webhooks/dynoapis/:resId/orders/status
 *   POST /webhooks/dynoapis/orders/:orderId/status
 *   POST /webhooks/dynoapis/:resId/orders/history
 */

const express = require("express");
const { getAllCachedTenants } = require("../../data/owner-setup-store");
const { addOnlineOrder } = require("../online-orders/online-orders.store");
const { saveOnlineOrder } = require("../online-orders/online-orders.repository");

const dynoWebhookRouter = express.Router();

/** Find the tenant + outlet whose dynoResId matches the incoming resId. */
function resolveOutletByResId(resId) {
  if (!resId) return null;
  const key = String(resId);
  for (const [tenantId, data] of getAllCachedTenants()) {
    const outlet = (data?.outlets || []).find(o => o.dynoResId && String(o.dynoResId) === key);
    if (outlet) return { tenantId, outletId: outlet.id, outletName: outlet.name };
  }
  return null;
}

/** Best-effort mapper from Dyno's Order.data (raw Swiggy/Zomato payload) to our internal shape. */
function normaliseDynoOrder(order) {
  const raw = order.data || {};

  const platform = (() => {
    const v = String(order.vendor || raw.vendor || raw.aggregator || "").toLowerCase();
    if (v.includes("swiggy")) return "Swiggy";
    if (v.includes("zomato")) return "Zomato";
    return "Online";
  })();

  const items = (raw.items || raw.order_items || raw.ordered_items || []).map(i => ({
    name:     i.name || i.item_name || i.title || "Item",
    price:    Number(i.price || i.unit_price || i.item_price || 0),
    quantity: Number(i.quantity || i.qty || i.count || 1),
    note:     i.note || i.special_instructions || i.instructions || "",
  }));

  const customer = {
    name:    raw.customer?.name    || raw.customer_name    || "Guest",
    phone:   raw.customer?.phone   || raw.customer_phone   || "",
    address: raw.customer?.address || raw.delivery_address || "",
  };

  return {
    id:      String(order.orderId || raw.order_id || raw.id),
    orderId: String(order.orderId || raw.order_id || raw.id),
    platform,
    customer,
    items,
    total:   Number(raw.total || raw.order_total || raw.grand_total || 0),
    etaMin:  Number(raw.eta_minutes || raw.eta || 30),
    notes:   raw.instructions || raw.notes || "",
  };
}

/** GET /status — health check Dyno calls to verify the webhook host is reachable. */
dynoWebhookRouter.get("/status", (_req, res) => {
  res.json({ status: "ok" });
});

/** POST /orders — Dyno pushes new Swiggy/Zomato orders here. */
dynoWebhookRouter.post("/orders", async (req, res) => {
  const body   = req.body || {};
  const orders = Array.isArray(body.orders) ? body.orders : [];

  if (orders.length === 0) {
    console.warn("[dynoapis] /orders called with no orders array — ignoring:", JSON.stringify(body).slice(0, 500));
    return res.status(400).json({ status: "error", message: "orders array required" });
  }

  const results = [];
  for (const order of orders) {
    const resId = order?.resId;

    if (!order?.orderId || !resId) {
      console.error("[dynoapis] Rejected malformed order (missing orderId/resId):", JSON.stringify(order).slice(0, 500));
      results.push({ orderId: order?.orderId || null, status: "rejected", message: "Missing orderId/resId" });
      continue;
    }

    const target = resolveOutletByResId(resId);
    if (!target) {
      console.error(`[dynoapis] Rejected order ${order.orderId} — unknown resId "${resId}" (no outlet has this dynoResId configured)`);
      results.push({ orderId: order.orderId, status: "rejected", message: "Unknown resId" });
      continue;
    }

    try {
      const normalised = normaliseDynoOrder(order);
      const stored = addOnlineOrder(target.tenantId, target.outletId, normalised);

      saveOnlineOrder(target.tenantId, target.outletId, stored).catch(err =>
        console.error("[dynoapis] DB save failed:", err.message)
      );

      const io = req.app.locals.io;
      if (io) {
        io.to(`outlet:${target.tenantId}:${target.outletId}`).emit("online:order:new", {
          order: stored,
          outletId: target.outletId,
        });
      }

      console.log(`[dynoapis] order received | tenant=${target.tenantId} | outlet=${target.outletId} | platform=${stored.platform} | id=${stored.id}`);
      results.push({ orderId: order.orderId, status: "accepted", message: "Stored" });
    } catch (err) {
      console.error(`[dynoapis] Failed to process order ${order.orderId}:`, err.message);
      results.push({ orderId: order.orderId, status: "rejected", message: "Processing error" });
    }
  }

  res.json({ status: "ok", results });
});

/**
 * GET /:resId/orders/status — Dyno polls this to discover accept/ready/reject
 * actions it should perform against Swiggy/Zomato. We always report none for
 * now (order-receiving phase only) — wire this up once we report POS actions
 * back to Dyno.
 */
dynoWebhookRouter.get("/:resId/orders/status", (req, res) => {
  const target = resolveOutletByResId(req.params.resId);
  if (!target) {
    console.error(`[dynoapis] /orders/status polled for unknown resId "${req.params.resId}"`);
    return res.status(404).json({ orderHistory: false, orders: [] });
  }
  res.json({ orderHistory: false, orders: [] });
});

/** POST /orders/:orderId/status — Dyno confirms an accept/ready/reject action completed on Swiggy/Zomato. */
dynoWebhookRouter.post("/orders/:orderId/status", (req, res) => {
  const { statusCode, statusResponse } = req.body || {};
  console.log(`[dynoapis] order status confirmation | orderId=${req.params.orderId} | statusCode=${statusCode}`, statusResponse || "");
  res.json({ status: "ok", message: "Recorded" });
});

/** POST /:resId/orders/history — Dyno pushes historical orders. */
dynoWebhookRouter.post("/:resId/orders/history", (req, res) => {
  const target = resolveOutletByResId(req.params.resId);
  if (!target) {
    console.error(`[dynoapis] /orders/history posted for unknown resId "${req.params.resId}"`);
    return res.status(404).json({ status: "error", message: "Unknown resId" });
  }
  console.log(`[dynoapis] order history received | tenant=${target.tenantId} | outlet=${target.outletId}`);
  res.json({ status: "ok", message: "Recorded" });
});

module.exports = { dynoWebhookRouter };
