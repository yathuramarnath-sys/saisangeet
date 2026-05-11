/**
 * borzo.routes.js
 *
 * PRIVATE (JWT):
 *   POST /delivery/borzo/calculate     — estimate delivery fee before dispatching
 *   POST /delivery/borzo/dispatch      — dispatch rider (create Borzo order)
 *   POST /delivery/borzo/cancel/:id    — cancel an in-progress delivery
 *   GET  /delivery/borzo/status/:id    — poll live delivery status
 *   POST /delivery/borzo/config        — save API token + mode + enabled
 *   GET  /delivery/borzo/config        — get config status (never returns token)
 *
 * PUBLIC (no JWT):
 *   POST /webhooks/borzo               — Borzo delivery status callback
 */

const express       = require("express");
const { requireAuth }   = require("../../middleware/require-auth");
const { asyncHandler }  = require("../../utils/async-handler");
const { runWithTenant } = require("../../data/tenant-context");
const {
  getOwnerSetupData,
  updateOwnerSetupData,
} = require("../../data/owner-setup-store");
const {
  calculateDelivery,
  dispatchRider,
  getDeliveryStatus,
  cancelDelivery,
  parseWebhook,
  pendingDeliveries,
} = require("./borzo.service");

const borzoRouter  = express.Router();   // private — mounted under /delivery/borzo
const borzoWebhook = express.Router();   // public  — mounted under /webhooks

const PUBLIC_API_URL = process.env.PUBLIC_API_URL || "https://api.dinexpos.in";

// ─────────────────────────────────────────────────────────────────────────────
// Helper — get credentials from ownerSetupData
// ─────────────────────────────────────────────────────────────────────────────

function getCreds(data) {
  const cfg = data?.borzo;
  if (!cfg?.enabled || !cfg?.token) return null;
  return {
    token: cfg.token,
    mode:  cfg.mode || "sandbox",
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC — Borzo webhook
// POST /webhooks/borzo
// ─────────────────────────────────────────────────────────────────────────────
borzoWebhook.post(
  "/borzo",
  express.json({ limit: "128kb" }),
  asyncHandler(async (req, res) => {
    let parsed;
    try { parsed = parseWebhook(req.body); }
    catch (err) {
      console.warn("[borzo webhook] parse error:", err.message);
      return res.status(400).json({ error: "Invalid payload" });
    }

    const { borzoOrderId, status, courierName, courierPhone, trackingUrl, isTerminal } = parsed;

    console.log(`[borzo webhook] orderId=${borzoOrderId} | status=${status}`);

    // Resolve outlet context from pendingDeliveries map
    const ctx = pendingDeliveries.get(borzoOrderId);

    const io = req.app.locals.io;
    if (io && ctx) {
      const { tenantId, outletId, onlineOrderId } = ctx;

      io.to(`outlet:${tenantId}:${outletId}`).emit("delivery:borzo:status", {
        borzoOrderId,
        onlineOrderId,
        status,
        courierName,
        courierPhone,
        trackingUrl,
        isTerminal,
        updatedAt: new Date().toISOString(),
      });

      // Clean up completed/cancelled deliveries from the map
      if (isTerminal) pendingDeliveries.delete(borzoOrderId);
    }

    res.status(200).json({ message: "OK" });
  })
);

// ─────────────────────────────────────────────────────────────────────────────
// PRIVATE — Calculate delivery fee
// POST /delivery/borzo/calculate
// Body: { outletId, pickup, drop }
//   pickup: { address, contactName, contactPhone }
//   drop:   { address, contactName, contactPhone, collectAmount }
// ─────────────────────────────────────────────────────────────────────────────
borzoRouter.post(
  "/calculate",
  requireAuth,
  asyncHandler(async (req, res) => {
    const tenantId = req.user?.tenantId || "default";
    const { outletId, pickup, drop } = req.body;

    if (!pickup?.address || !drop?.address) {
      return res.status(400).json({ error: "pickup.address and drop.address are required" });
    }

    const data  = await runWithTenant(tenantId, () => getOwnerSetupData());
    const creds = getCreds(data);
    if (!creds) return res.status(400).json({ error: "Borzo not configured. Add your token in Integrations → Borzo." });

    const result = await calculateDelivery({ pickup, drop }, creds);
    res.json(result);
  })
);

// ─────────────────────────────────────────────────────────────────────────────
// PRIVATE — Dispatch rider
// POST /delivery/borzo/dispatch
// Body: { outletId, onlineOrderId, orderRef, pickup, drop, notes, collectAmount }
// ─────────────────────────────────────────────────────────────────────────────
borzoRouter.post(
  "/dispatch",
  requireAuth,
  asyncHandler(async (req, res) => {
    const tenantId = req.user?.tenantId || "default";
    const { outletId, onlineOrderId, orderRef, pickup, drop, notes } = req.body;

    if (!outletId || !pickup?.address || !drop?.address) {
      return res.status(400).json({ error: "outletId, pickup.address and drop.address are required" });
    }

    const data  = await runWithTenant(tenantId, () => getOwnerSetupData());
    const creds = getCreds(data);
    if (!creds) return res.status(400).json({ error: "Borzo not configured." });

    const callbackUrl = `${PUBLIC_API_URL}/webhooks/borzo`;

    const result = await dispatchRider(
      {
        context: { tenantId, outletId, onlineOrderId, orderRef },
        pickup, drop, notes, callbackUrl,
      },
      creds
    );

    res.json(result);
  })
);

// ─────────────────────────────────────────────────────────────────────────────
// PRIVATE — Get live status (polling fallback)
// GET /delivery/borzo/status/:borzoOrderId
// ─────────────────────────────────────────────────────────────────────────────
borzoRouter.get(
  "/status/:borzoOrderId",
  requireAuth,
  asyncHandler(async (req, res) => {
    const tenantId = req.user?.tenantId || "default";
    const data     = await runWithTenant(tenantId, () => getOwnerSetupData());
    const creds    = getCreds(data);
    if (!creds) return res.status(400).json({ error: "Borzo not configured." });

    const result = await getDeliveryStatus(req.params.borzoOrderId, creds);
    res.json(result);
  })
);

// ─────────────────────────────────────────────────────────────────────────────
// PRIVATE — Cancel delivery
// POST /delivery/borzo/cancel/:borzoOrderId
// ─────────────────────────────────────────────────────────────────────────────
borzoRouter.post(
  "/cancel/:borzoOrderId",
  requireAuth,
  asyncHandler(async (req, res) => {
    const tenantId = req.user?.tenantId || "default";
    const data     = await runWithTenant(tenantId, () => getOwnerSetupData());
    const creds    = getCreds(data);
    if (!creds) return res.status(400).json({ error: "Borzo not configured." });

    const result = await cancelDelivery(req.params.borzoOrderId, creds);
    res.json(result);
  })
);

// ─────────────────────────────────────────────────────────────────────────────
// PRIVATE — Save credentials
// POST /delivery/borzo/config
// Body: { token, mode, enabled }
// ─────────────────────────────────────────────────────────────────────────────
borzoRouter.post(
  "/config",
  requireAuth,
  asyncHandler(async (req, res) => {
    const tenantId = req.user?.tenantId || "default";
    const { token, mode, enabled } = req.body;

    await runWithTenant(tenantId, () =>
      updateOwnerSetupData(d => ({
        ...d,
        borzo: {
          token:   token   ?? d.borzo?.token   ?? "",
          mode:    mode    ?? d.borzo?.mode    ?? "sandbox",
          enabled: enabled ?? d.borzo?.enabled ?? false,
        },
      }))
    );

    res.json({ ok: true });
  })
);

// ─────────────────────────────────────────────────────────────────────────────
// PRIVATE — Get config status (never returns token)
// GET /delivery/borzo/config
// ─────────────────────────────────────────────────────────────────────────────
borzoRouter.get(
  "/config",
  requireAuth,
  asyncHandler(async (req, res) => {
    const tenantId = req.user?.tenantId || "default";
    const data     = await runWithTenant(tenantId, () => getOwnerSetupData());
    const cfg      = data?.borzo || {};

    res.json({
      mode:        cfg.mode    || "sandbox",
      enabled:     !!cfg.enabled,
      tokenSet:    !!cfg.token,
      configured:  !!(cfg.token && cfg.enabled),
    });
  })
);

module.exports = { borzoRouter, borzoWebhook };
