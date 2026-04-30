/**
 * billing.routes.js
 *
 * Public webhook route (/billing/webhook) must receive the RAW body
 * so Razorpay HMAC verification works.  All other routes are auth-gated.
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

const billingRouter = express.Router();

// ── Public — Razorpay webhook (needs raw body) ────────────────────────────
billingRouter.post(
  "/webhook",
  express.raw({ type: "application/json" }),
  asyncHandler(webhookHandler)
);

// ── Authenticated routes ──────────────────────────────────────────────────
billingRouter.get(  "/plans",     asyncHandler(plansHandler));
billingRouter.get(  "/status",    requireAuth, asyncHandler(statusHandler));
billingRouter.post( "/subscribe", requireAuth, asyncHandler(subscribeHandler));
billingRouter.post( "/cancel",    requireAuth, asyncHandler(cancelHandler));

module.exports = { billingRouter };
