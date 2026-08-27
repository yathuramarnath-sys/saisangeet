/**
 * WhatsApp Ordering — Routes
 *
 * PUBLIC (no JWT):
 *   GET  /webhooks/wa-order          — Meta webhook verification
 *   POST /webhooks/wa-order          — Incoming WhatsApp messages
 *
 * PRIVATE (JWT required):
 *   GET  /whatsapp-ordering/config   — Get current config (masked token)
 *   PUT  /whatsapp-ordering/config   — Save config
 *   GET  /whatsapp-ordering/status   — Connection status
 */

const express      = require("express");
const { requireAuth }      = require("../../middleware/require-auth");
const { asyncHandler }     = require("../../utils/async-handler");
const { runWithTenant }    = require("../../data/tenant-context");
const { getOwnerSetupData } = require("../../data/owner-setup-store");
const {
  getWaConfigByPhoneNumberId,
  getWaConfigByTenant,
  saveWaConfig,
} = require("./whatsapp-ordering.repository");
const { handleIncomingMessage } = require("./whatsapp-ordering.service");

const waOrderWebhookRouter = express.Router();   // public
const waOrderingRouter     = express.Router();   // private (JWT)

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC — Meta webhook verification
// GET /webhooks/wa-order?hub.mode=subscribe&hub.challenge=...&hub.verify_token=...
// ─────────────────────────────────────────────────────────────────────────────
waOrderWebhookRouter.get("/wa-order", (req, res) => {
  const mode      = req.query["hub.mode"];
  const token     = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  // The verify token is set in env or per-tenant. We accept either.
  const platformToken = process.env.WA_ORDERING_VERIFY_TOKEN || "";

  if (mode === "subscribe" && (token === platformToken || token?.startsWith("plato_wa_"))) {
    console.log("[wa-order] Webhook verified.");
    return res.status(200).send(challenge);
  }
  res.status(403).send("Forbidden");
});

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC — Incoming WhatsApp messages from Meta
// POST /webhooks/wa-order
// ─────────────────────────────────────────────────────────────────────────────
waOrderWebhookRouter.post(
  "/wa-order",
  express.json({ limit: "512kb" }),
  asyncHandler(async (req, res) => {
    // Always respond 200 immediately — Meta retries if we don't
    res.status(200).json({ status: "ok" });

    const body = req.body;
    if (body?.object !== "whatsapp_business_account") return;

    const entries = body.entry || [];
    for (const entry of entries) {
      for (const change of (entry.changes || [])) {
        if (change.field !== "messages") continue;
        const val = change.value;
        if (!val?.messages?.length) continue;

        const phoneNumberId  = val.metadata?.phone_number_id;
        const contactsMap    = Object.fromEntries(
          (val.contacts || []).map(c => [c.wa_id, c.profile?.name || ""])
        );

        // Look up tenant by phone_number_id
        const cfg = await getWaConfigByPhoneNumberId(phoneNumberId).catch(() => null);
        if (!cfg) {
          console.warn(`[wa-order] No active config for phone_number_id=${phoneNumberId}`);
          continue;
        }

        const tenantData = await runWithTenant(cfg.tenant_id, () => getOwnerSetupData()).catch(() => null);
        if (!tenantData) continue;

        const io = req.app.locals.io;

        for (const message of val.messages) {
          // Skip non-customer messages (status updates, etc.)
          if (!["text", "interactive", "image"].includes(message.type)) continue;

          const from        = message.from;
          const contactName = contactsMap[from] || "";

          handleIncomingMessage({
            io,
            tenantId:    cfg.tenant_id,
            cfg,
            pid:         phoneNumberId,
            token:       cfg.access_token,
            from,
            message,
            contactName,
            tenantData,
          }).catch(err => {
            console.error(`[wa-order] Error handling message from ${from}:`, err.message);
          });
        }
      }
    }
  })
);

// ─────────────────────────────────────────────────────────────────────────────
// PRIVATE — Config management
// ─────────────────────────────────────────────────────────────────────────────

/** GET /whatsapp-ordering/config */
waOrderingRouter.get(
  "/config",
  requireAuth,
  asyncHandler(async (req, res) => {
    const tenantId = req.user?.tenantId;
    const cfg = await getWaConfigByTenant(tenantId);
    if (!cfg) return res.json({ configured: false });

    // Never return the raw access token
    res.json({
      configured:         true,
      outletId:           cfg.outlet_id,
      phoneNumberId:      cfg.phone_number_id,
      wabaId:             cfg.waba_id,
      displayPhone:       cfg.display_phone,
      isActive:           cfg.is_active,
      restaurantName:     cfg.restaurant_name,
      minOrderAmount:     cfg.min_order_amount,
      prepTimeMinutes:    cfg.prep_time_minutes,
      advanceCategoryIds: cfg.advance_category_ids || [],
      scheduledPickup:    cfg.scheduled_pickup,
      openingTime:        cfg.opening_time,
      closingTime:        cfg.closing_time,
      webhookUrl:         `${process.env.PUBLIC_API_URL || "https://api.dinexpos.in"}/webhooks/wa-order`,
      accessTokenSet:     !!cfg.access_token,
      webhookVerifyToken: cfg.webhook_verify_token || "",
    });
  })
);

/** PUT /whatsapp-ordering/config */
waOrderingRouter.put(
  "/config",
  requireAuth,
  asyncHandler(async (req, res) => {
    const tenantId = req.user?.tenantId;
    const {
      outletId, phoneNumberId, wabaId, accessToken, webhookVerifyToken,
      displayPhone, isActive, restaurantName, minOrderAmount,
      prepTimeMinutes, advanceCategoryIds, scheduledPickup,
      openingTime, closingTime,
    } = req.body;

    if (!phoneNumberId) return res.status(400).json({ error: "phoneNumberId is required" });

    await saveWaConfig(tenantId, {
      outletId, phoneNumberId, wabaId, accessToken, webhookVerifyToken,
      displayPhone, isActive, restaurantName, minOrderAmount,
      prepTimeMinutes, advanceCategoryIds, scheduledPickup,
      openingTime, closingTime,
    });

    res.json({ ok: true });
  })
);

/** GET /whatsapp-ordering/status */
waOrderingRouter.get(
  "/status",
  requireAuth,
  asyncHandler(async (req, res) => {
    const tenantId = req.user?.tenantId;
    const cfg = await getWaConfigByTenant(tenantId);
    res.json({
      active:       !!(cfg?.is_active),
      configured:   !!(cfg?.phone_number_id && cfg?.access_token),
      displayPhone: cfg?.display_phone || null,
      restaurantName: cfg?.restaurant_name || null,
    });
  })
);

module.exports = { waOrderWebhookRouter, waOrderingRouter };
