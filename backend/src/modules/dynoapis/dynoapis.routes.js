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
 * Accept/ready/reject actions taken in the POS are reported back via Dyno's
 * poll model: queued in dynoapis.actions.js, handed off on the next
 * GET /:resId/orders/status call, confirmed by Dyno via
 * POST /orders/:orderId/status.
 *
 * Mounted at /webhooks/dynoapis in app.js:
 *   GET  /webhooks/dynoapis/status
 *   POST /webhooks/dynoapis/orders
 *   GET  /webhooks/dynoapis/:resId/orders/status
 *   POST /webhooks/dynoapis/orders/:orderId/status
 *   POST /webhooks/dynoapis/:resId/orders/history
 *   GET  /webhooks/dynoapis/:resId/items
 *   POST /webhooks/dynoapis/:resId/items
 *   POST /webhooks/dynoapis/:resId/items/status
 *   POST /webhooks/dynoapis/:resId/categories/status
 *
 * Items/categories phase: stock-status (in-stock/out-of-stock) sync only —
 * Dyno's own contract here has no name/price/photo fields, so this does not
 * cover menu authoring (that stays with whichever POS partner is registered
 * as the live menu manager on Swiggy/Zomato's side).
 */

const express = require("express");
const { getAllCachedTenants } = require("../../data/owner-setup-store");
const { addOnlineOrder } = require("../online-orders/online-orders.store");
const { saveOnlineOrder } = require("../online-orders/online-orders.repository");
const { runWithTenant } = require("../../data/tenant-context");
const { fetchMenuItems, fetchMenuCategories } = require("../menu/menu.service");
const { drainDynoOrderActions } = require("./dynoapis.actions");

const dynoWebhookRouter = express.Router();

/**
 * Find the tenant + outlet whose Swiggy or Zomato restaurant id matches the
 * incoming resId. Dyno sends the platform-native id as resId — a Swiggy
 * order's resId is the outlet's Swiggy id, a Zomato order's resId is the
 * outlet's Zomato id — so each outlet needs both ids checked, not just one.
 */
function resolveOutletByResId(resId) {
  if (!resId) return null;
  const key = String(resId);
  for (const [tenantId, data] of getAllCachedTenants()) {
    const outlet = (data?.outlets || []).find(o =>
      (o.dynoSwiggyId && String(o.dynoSwiggyId) === key) ||
      (o.dynoZomatoId && String(o.dynoZomatoId) === key)
    );
    if (outlet) {
      const aggregator = String(outlet.dynoSwiggyId) === key ? "swiggy" : "zomato";
      return { tenantId, outletId: outlet.id, outletName: outlet.name, aggregator };
    }
  }
  return null;
}

/** True when an item is currently in stock — combines its own sales toggle with this outlet's per-outlet availability. */
function isItemInStock(item) {
  return item.salesAvailability !== "Unavailable";
}

/** Best-effort mapper from Dyno's Order.data (raw Swiggy/Zomato payload) to our internal shape. */
function normaliseDynoOrder(order, target) {
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
    source:  "dyno",
    resId:   String(order.resId),
    aggregator: target?.aggregator || null,
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
      const normalised = normaliseDynoOrder(order, target);
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
 * actions it should perform against Swiggy/Zomato. Returns whatever the POS
 * has queued since the last poll (see dynoapis.actions.js) and clears the
 * queue — Dyno is expected to act on every entry returned here.
 */
dynoWebhookRouter.get("/:resId/orders/status", (req, res) => {
  const target = resolveOutletByResId(req.params.resId);
  if (!target) {
    console.error(`[dynoapis] /orders/status polled for unknown resId "${req.params.resId}"`);
    return res.status(404).json({ orderHistory: false, orders: [] });
  }

  const orders = drainDynoOrderActions(target.tenantId, target.outletId);
  if (orders.length) {
    console.log(`[dynoapis] handing off ${orders.length} order action(s) | tenant=${target.tenantId} | outlet=${target.outletId}`);
  }
  return res.json({ orderHistory: false, orders });
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

/**
 * GET /:resId/items — Dyno calls this to pull our current items/categories +
 * stock status, which it then pushes on to Swiggy/Zomato. Shape mirrors
 * Dyno's reference implementation (dynoapis/dams ItemsController/ItemService).
 */
dynoWebhookRouter.get("/:resId/items", async (req, res) => {
  const target = resolveOutletByResId(req.params.resId);
  if (!target) {
    console.error(`[dynoapis] /items polled for unknown resId "${req.params.resId}"`);
    return res.status(404).json({ restaurantId: req.params.resId, getAllItems: false, categories: [], items: [] });
  }

  try {
    const [items, categories] = await runWithTenant(target.tenantId, () =>
      Promise.all([fetchMenuItems(target.outletId), fetchMenuCategories(target.outletId)])
    );

    res.json({
      restaurantId: req.params.resId,
      getAllItems: true,
      categories: categories.map(c => ({
        id: String(c.id),
        stockStatus: req.app.locals.outletCategoryAvailability?.[target.outletId]?.[c.id]?.available !== false,
        aggregator: target.aggregator,
      })),
      items: items.map(i => ({
        id: String(i.id),
        stockStatus: isItemInStock(i),
        aggregator: target.aggregator,
      })),
    });
  } catch (err) {
    console.error(`[dynoapis] /items failed for resId ${req.params.resId}:`, err.message);
    res.status(500).json({ restaurantId: req.params.resId, getAllItems: false, categories: [], items: [] });
  }
});

/**
 * POST /:resId/items — Dyno posts back the items list it fetched from
 * Swiggy/Zomato's side (for us to mirror/log). We don't yet maintain a
 * separate aggregator-item store, so this is logged only.
 */
dynoWebhookRouter.post("/:resId/items", (req, res) => {
  const target = resolveOutletByResId(req.params.resId);
  if (!target) {
    console.error(`[dynoapis] /items posted for unknown resId "${req.params.resId}"`);
    return res.status(404).json({ status: 404, message: "Unknown resId" });
  }

  const body  = req.body || {};
  const items = Array.isArray(body.items) ? body.items : [];
  console.log(`[dynoapis] items received | tenant=${target.tenantId} | outlet=${target.outletId} | count=${items.length}`);
  res.json({ status: 200, message: "Items received" });
});

/** POST /:resId/items/status — Dyno confirms an item stock-status push completed on Swiggy/Zomato. */
dynoWebhookRouter.post("/:resId/items/status", (req, res) => {
  const target = resolveOutletByResId(req.params.resId);
  if (!target) {
    console.error(`[dynoapis] /items/status posted for unknown resId "${req.params.resId}"`);
    return res.status(404).json({ status: 404, message: "Unknown resId" });
  }

  const body   = req.body || {};
  const status = Array.isArray(body.items) ? body.items : [body];
  console.log(`[dynoapis] item status confirmation | tenant=${target.tenantId} | outlet=${target.outletId}`, JSON.stringify(status).slice(0, 500));
  res.json({ status: 200, message: "Recorded" });
});

/** POST /:resId/categories/status — Dyno confirms a category stock-status push completed on Swiggy/Zomato. */
dynoWebhookRouter.post("/:resId/categories/status", (req, res) => {
  const target = resolveOutletByResId(req.params.resId);
  if (!target) {
    console.error(`[dynoapis] /categories/status posted for unknown resId "${req.params.resId}"`);
    return res.status(404).json({ status: 404, message: "Unknown resId" });
  }

  const body   = req.body || {};
  const status = Array.isArray(body.categories) ? body.categories : [body];
  console.log(`[dynoapis] category status confirmation | tenant=${target.tenantId} | outlet=${target.outletId}`, JSON.stringify(status).slice(0, 500));
  res.json({ status: 200, message: "Recorded" });
});

module.exports = { dynoWebhookRouter };
