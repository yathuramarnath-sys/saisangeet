/**
 * billing.routes.js
 *
 * razorpayWebhook — mounted in app.js at /webhooks/billing BEFORE requireTenant,
 * so Razorpay (no JWT) can reach it. Uses express.raw() so req.body is the raw
 * Buffer needed for HMAC verification.
 *
 * billingRouter — mounted in routes/index.js after requireTenant for authenticated
 * billing management routes.
 */

const express = require("express");
const { requireAuth } = require("../../middleware/require-auth");
const { asyncHandler } = require("../../utils/async-handler");
const {
  statusHandler,
  plansHandler,
  subscribeHandler,
  cancelHandler,
  webhookHandler,
} = require("./billing.controller");

// ── Public webhook router (mounted at /webhooks/billing in app.js) ────────
const razorpayWebhook = express.Router();
razorpayWebhook.post(
  "/webhook",
  express.raw({ type: "application/json" }),
  asyncHandler(webhookHandler)
);

// ── Authenticated routes (mounted at /billing in routes/index.js) ─────────
const billingRouter = express.Router();
billingRouter.get(  "/plans",     asyncHandler(plansHandler));
billingRouter.get(  "/status",    requireAuth, asyncHandler(statusHandler));
billingRouter.post( "/subscribe", requireAuth, asyncHandler(subscribeHandler));
billingRouter.post( "/cancel",    requireAuth, asyncHandler(cancelHandler));

module.exports = { billingRouter, razorpayWebhook };
