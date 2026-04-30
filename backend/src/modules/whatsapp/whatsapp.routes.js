/**
 * whatsapp.routes.js
 * All routes are tenant-scoped (authenticated).
 *
 * GET  /whatsapp/config          → returns masked Twilio config
 * POST /whatsapp/config          → save credentials
 * POST /whatsapp/test            → send test message to owner's number
 * POST /whatsapp/send-bill       → send bill to customer's number
 */

const express = require("express");
const { requireAuth }  = require("../../middleware/require-auth");
const { asyncHandler } = require("../../utils/async-handler");
const {
  getMaskedConfig,
  saveConfig,
  sendBill,
  sendTest,
} = require("./whatsapp.service");

const whatsappRouter = express.Router();

// GET /whatsapp/config — returns masked credentials (auth token last 4 chars only)
whatsappRouter.get("/config", requireAuth, asyncHandler(async (_req, res) => {
  res.json(getMaskedConfig());
}));

// POST /whatsapp/config — save / update Twilio credentials
whatsappRouter.post("/config", requireAuth, asyncHandler(async (req, res) => {
  const { accountSid, authToken, fromNumber, enabled } = req.body;
  const result = saveConfig({ accountSid, authToken, fromNumber, enabled });
  res.json(result);
}));

// POST /whatsapp/test — send a test "you're live!" message to the given phone
whatsappRouter.post("/test", requireAuth, asyncHandler(async (req, res) => {
  const { phone } = req.body;
  if (!phone) return res.status(400).json({ message: "phone is required" });
  const result = await sendTest({ phone });
  res.json(result);
}));

// POST /whatsapp/send-bill — send a closed-order bill to the customer's WhatsApp
whatsappRouter.post("/send-bill", requireAuth, asyncHandler(async (req, res) => {
  const { orderId, outletId, phone } = req.body;
  if (!orderId) return res.status(400).json({ message: "orderId is required" });
  if (!phone)   return res.status(400).json({ message: "phone is required" });

  const result = await sendBill({
    tenantId: req.user.tenantId,
    orderId,
    outletId: outletId || null,
    phone,
  });
  res.json(result);
}));

module.exports = { whatsappRouter };
