/**
 * whatsapp-ordering.routes.js
 *
 * Public:
 *   POST /webhooks/wa-order   — Twilio inbound webhook (no JWT)
 *
 * Private (JWT required):
 *   GET  /whatsapp-ordering/config   — returns masked credentials
 *   POST /whatsapp-ordering/config   — save credentials
 */

const express = require("express");
const { requireAuth } = require("../../middleware/require-auth");
const { asyncHandler } = require("../../utils/async-handler");
const { getMaskedConfig, saveConfig, handleInbound } = require("./whatsapp-ordering.service");

// ── Public webhook (called by Twilio) ────────────────────────────────────────

const waOrderWebhook = express.Router();

waOrderWebhook.post("/wa-order", asyncHandler(async (req, res) => {
  // Twilio sends form-encoded body: From, To, Body, MessageSid, ...
  const from = req.body.From || "";
  const to   = req.body.To   || "";
  const body = req.body.Body || "";

  if (!from || !to) {
    return res.status(400).send("Missing From/To");
  }

  // Respond 200 immediately — Twilio retries on non-2xx
  res.status(200).send("");

  // Handle asynchronously so response is not delayed
  handleInbound({ from, to, body }).catch((err) => {
    console.error("[wa-order] handleInbound error:", err.message);
  });
}));

// ── Private config routes ─────────────────────────────────────────────────────

const waOrderingRouter = express.Router();

waOrderingRouter.get("/config", requireAuth, asyncHandler(async (_req, res) => {
  res.json(getMaskedConfig());
}));

waOrderingRouter.post("/config", requireAuth, asyncHandler(async (req, res) => {
  const { accountSid, apiKey, apiSecret, fromNumber, notifyNumber, enabled } = req.body;
  const result = saveConfig({ accountSid, apiKey, apiSecret, fromNumber, notifyNumber, enabled });
  res.json(result);
}));

module.exports = { waOrderWebhook, waOrderingRouter };
