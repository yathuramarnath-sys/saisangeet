/**
 * online-orders.routes.js
 *
 * Two route groups:
 *
 * PUBLIC (no JWT) — webhook receiver:
 *   POST /webhooks/online-order/:tenantId
 *   POST /webhooks/online-order/:tenantId/:outletId
 *
 * PRIVATE (JWT required) — POS/Captain actions:
 *   GET  /online-orders?outletId=&status=
 *   POST /online-orders/:orderId/accept
 *   POST /online-orders/:orderId/reject
 *   POST /online-orders/webhook-secret/regenerate
 */

const express  = require("express");
const crypto   = require("crypto");
const { requireAuth }       = require("../../middleware/require-auth");
const { asyncHandler }      = require("../../utils/async-handler");
const { runWithTenant }     = require("../../data/tenant-context");
const {
  addOnlineOrder,
  updateOnlineOrderStatus,
  getOnlineOrders,
} = require("./online-orders.store");
const {
  getOwnerSetupData,
  updateOwnerSetupData,
  getAllCachedTenants,
} = require("../../data/owner-setup-store");
const {
  acceptOrder: upAccept,
  rejectOrder: upReject,
  getUpCreds,
} = require("./urbanpiper.service");

const onlineOrdersRouter  = express.Router();   // private (JWT)
const webhooksRouter      = express.Router();   // public (no JWT, no rate-limit override)

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Look up tenantId by slug/id — handles both "tenant-abc" and raw UUID. */
function resolveTenant(tenantIdParam) {
  // Check all cached tenants for a match by id or slug
  for (const [tid] of getAllCachedTenants()) {
    if (tid === tenantIdParam) return tid;
  }
  // Fallback: treat param as literal tenantId (single-tenant / dev)
  return tenantIdParam || "default";
}

/** Verify HMAC-SHA256 signature from UrbanPiper / custom webhook senders. */
function verifySignature(rawBody, secret, sigHeader) {
  if (!secret || !sigHeader) return false;
  // UrbanPiper sends:  X-Hub-Signature-256: sha256=<hex>
  const expected = `sha256=${crypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex")}`;
  try {
    return crypto.timingSafeEqual(Buffer.from(sigHeader), Buffer.from(expected));
  } catch {
    return false;
  }
}

/** Normalise the UrbanPiper order payload into our internal format. */
function normaliseUrbanPiper(body) {
  // UrbanPiper webhook body reference:
  // https://urbanpiper.com/docs/webhook-reference
  const order = body.order || body;

  const platform = (() => {
    const ch = String(order.channel || body.channel || "").toLowerCase();
    if (ch.includes("swiggy")) return "Swiggy";
    if (ch.includes("zomato")) return "Zomato";
    if (ch.includes("dunzo")) return "Dunzo";
    return "Online";
  })();

  const items = (order.items || order.ordered_items || []).map(i => ({
    name:     i.title || i.name || i.item_title || "Item",
    price:    Number(i.price || i.item_price || 0),
    quantity: Number(i.quantity || i.count || 1),
    note:     i.note || i.instructions || "",
  }));

  const customer = {
    name:    order.customer?.name  || order.user?.name    || "Guest",
    phone:   order.customer?.phone || order.user?.phone   || "",
    address: order.address?.address_1 || order.delivery_address || "",
  };

  return {
    id:       String(order.id || order.order_id || `up-${Date.now()}`),
    orderId:  String(order.ext_platforms?.[0]?.order_id || order.order_id || order.id),
    platform,
    customer,
    items,
    total:    Number(order.total || order.order_total || 0),
    etaMin:   Number(order.eta_in_secs ? Math.ceil(order.eta_in_secs / 60) : (order.eta_minutes || 30)),
    notes:    order.instructions || order.notes || "",
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC — Webhook receiver
// POST /webhooks/online-order/:tenantId
// POST /webhooks/online-order/:tenantId/:outletId
// ─────────────────────────────────────────────────────────────────────────────
webhooksRouter.post(
  "/online-order/:tenantId/:outletId?",
  express.raw({ type: "*/*", limit: "512kb" }),   // raw body for HMAC verification
  asyncHandler(async (req, res) => {
    const { tenantId: tenantParam, outletId: outletParam } = req.params;
    const tenantId = resolveTenant(tenantParam);

    // Load tenant data to get webhook secret + outlet list
    const tenantData = await runWithTenant(tenantId, () => getOwnerSetupData());

    // Verify HMAC signature if a secret is configured
    const secret    = tenantData?.onlineOrders?.webhookSecret;
    const sigHeader = req.headers["x-hub-signature-256"] ||
                      req.headers["x-urbanpiper-signature"] ||
                      req.headers["x-signature"];

    if (secret && sigHeader) {
      const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body || "");
      if (!verifySignature(rawBody, secret, sigHeader)) {
        return res.status(401).json({ error: "Invalid webhook signature" });
      }
    }

    // Parse body
    let body;
    try {
      const raw = Buffer.isBuffer(req.body) ? req.body.toString("utf8") : String(req.body || "{}");
      body = JSON.parse(raw);
    } catch {
      return res.status(400).json({ error: "Invalid JSON body" });
    }

    // Resolve outletId — use URL param, or first outlet in tenant, or body field
    const outlets  = tenantData?.outlets || [];
    const outletId = outletParam ||
                     body.outlet_id || body.outletId ||
                     outlets[0]?.id ||
                     "default";

    // Normalise payload
    const order = normaliseUrbanPiper(body);

    // Store in memory
    const stored = await runWithTenant(tenantId, () =>
      addOnlineOrder(tenantId, outletId, order)
    );

    // Push to all POS/Captain screens in that outlet via socket
    const io = req.app.locals.io;
    if (io) {
      io.to(`outlet:${tenantId}:${outletId}`).emit("online:order:new", {
        order: stored,
        outletId,
      });
    }

    console.log(`[webhook] online order received | tenant=${tenantId} | outlet=${outletId} | platform=${stored.platform} | id=${stored.id}`);
    res.json({ ok: true, id: stored.id });
  })
);

// ─────────────────────────────────────────────────────────────────────────────
// PRIVATE — POS/Captain actions
// ─────────────────────────────────────────────────────────────────────────────

/** GET /online-orders?outletId=&status= */
onlineOrdersRouter.get(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const tenantId = req.user?.tenantId || "default";
    const { outletId, status } = req.query;
    if (!outletId) return res.status(400).json({ error: "outletId required" });
    const orders = getOnlineOrders(tenantId, outletId, status || null);
    res.json(orders);
  })
);

/** POST /online-orders/:orderId/accept */
onlineOrdersRouter.post(
  "/:orderId/accept",
  requireAuth,
  asyncHandler(async (req, res) => {
    const tenantId = req.user?.tenantId || "default";
    const { outletId, prepMins } = req.body;
    if (!outletId) return res.status(400).json({ error: "outletId required" });

    const updated = updateOnlineOrderStatus(tenantId, outletId, req.params.orderId, "accepted", {
      acceptedAt: new Date().toISOString(),
      acceptedBy: req.user?.name || "POS",
    });
    if (!updated) return res.status(404).json({ error: "Order not found" });

    // ── Fire UrbanPiper callback (non-blocking) ────────────────────────────
    // Use the stored UrbanPiper order id (same as our order.id from normaliseUrbanPiper)
    const tenantData = await runWithTenant(tenantId, () => getOwnerSetupData());
    upAccept(updated.id, tenantData, { prepMins: prepMins || 20 }).catch(() => {});

    res.json({ ok: true, order: updated, upCallbackFired: !!getUpCreds(tenantData) });
  })
);

/** POST /online-orders/:orderId/reject */
onlineOrdersRouter.post(
  "/:orderId/reject",
  requireAuth,
  asyncHandler(async (req, res) => {
    const tenantId = req.user?.tenantId || "default";
    const { outletId, reason } = req.body;
    if (!outletId) return res.status(400).json({ error: "outletId required" });

    const updated = updateOnlineOrderStatus(tenantId, outletId, req.params.orderId, "rejected", {
      rejectReason: reason || "Rejected",
      rejectedAt:   new Date().toISOString(),
    });
    if (!updated) return res.status(404).json({ error: "Order not found" });

    // ── Fire UrbanPiper callback (non-blocking) ────────────────────────────
    const tenantData = await runWithTenant(tenantId, () => getOwnerSetupData());
    upReject(updated.id, tenantData, { reason: reason || "Restaurant busy" }).catch(() => {});

    res.json({ ok: true, order: updated, upCallbackFired: !!getUpCreds(tenantData) });
  })
);

/** POST /online-orders/webhook-secret/regenerate — generate/rotate secret */
onlineOrdersRouter.post(
  "/webhook-secret/regenerate",
  requireAuth,
  asyncHandler(async (req, res) => {
    const tenantId = req.user?.tenantId || "default";
    const secret   = `wh_live_${crypto.randomBytes(24).toString("hex")}`;

    await runWithTenant(tenantId, () =>
      updateOwnerSetupData(data => ({
        ...data,
        onlineOrders: { ...(data.onlineOrders || {}), webhookSecret: secret }
      }))
    );

    res.json({ ok: true, secret });
  })
);

/** GET /online-orders/config — webhook URL + masked secret + UP credentials status */
onlineOrdersRouter.get(
  "/config",
  requireAuth,
  asyncHandler(async (req, res) => {
    const tenantId = req.user?.tenantId || "default";
    const data     = await runWithTenant(tenantId, () => getOwnerSetupData());
    const outlets  = (data?.outlets || []).filter(o => o.isActive !== false);
    const secret   = data?.onlineOrders?.webhookSecret || null;
    const upCfg    = data?.onlineOrders?.urbanPiper    || {};
    const baseUrl  = process.env.PUBLIC_API_URL || "https://api.dinexpos.in";

    res.json({
      webhookUrl:    `${baseUrl}/webhooks/online-order/${tenantId}`,
      outletUrls:    outlets.map(o => ({
        outletId:   o.id,
        outletName: o.name,
        url:        `${baseUrl}/webhooks/online-order/${tenantId}/${o.id}`,
      })),
      secretConfigured: !!secret,
      secretMasked: secret
        ? `wh_live_${"•".repeat(Math.max(0, secret.length - 12))}${secret.slice(-6)}`
        : null,
      // UrbanPiper API credentials status (never return the actual apiKey)
      urbanPiper: {
        enabled:       !!upCfg.enabled,
        bizId:         upCfg.bizId || "",
        apiKeySet:     !!upCfg.apiKey,
        callbacksLive: !!(upCfg.enabled && upCfg.bizId && upCfg.apiKey),
      },
    });
  })
);

/**
 * POST /online-orders/urbanpiper-config
 * Save UrbanPiper API credentials (bizId + apiKey).
 * Called from Owner Console → Integrations page.
 */
onlineOrdersRouter.post(
  "/urbanpiper-config",
  requireAuth,
  asyncHandler(async (req, res) => {
    const tenantId = req.user?.tenantId || "default";
    const { bizId, apiKey, enabled } = req.body;

    await runWithTenant(tenantId, () =>
      updateOwnerSetupData(data => ({
        ...data,
        onlineOrders: {
          ...(data.onlineOrders || {}),
          urbanPiper: {
            bizId:   bizId   ?? data.onlineOrders?.urbanPiper?.bizId   ?? "",
            // Only overwrite apiKey if a new one is provided (empty string = clear)
            apiKey:  apiKey !== undefined
              ? apiKey
              : (data.onlineOrders?.urbanPiper?.apiKey ?? ""),
            enabled: enabled ?? data.onlineOrders?.urbanPiper?.enabled ?? false,
          },
        },
      }))
    );

    res.json({ ok: true });
  })
);

module.exports = { onlineOrdersRouter, webhooksRouter };
