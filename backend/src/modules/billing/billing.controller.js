/**
 * billing.controller.js
 */

const {
  getBillingStatus,
  createSubscription,
  handleWebhook,
  cancelSubscription,
} = require("./billing.service");

const { PLANS } = require("./billing.plans");

// GET /billing/status
async function statusHandler(req, res) {
  const tenantId = req.user?.tenantId || "default";
  const status = await getBillingStatus(tenantId);
  res.json(status);
}

// GET /billing/plans
async function plansHandler(_req, res) {
  // Return plans without internal Razorpay plan IDs
  const plans = Object.values(PLANS).map(({ razorpayPlanId: _omit, ...rest }) => rest);
  res.json({ plans });
}

// POST /billing/subscribe  { planId }
async function subscribeHandler(req, res) {
  const tenantId = req.user?.tenantId || "default";
  const { planId } = req.body;

  if (!planId) {
    return res.status(400).json({ error: "planId is required" });
  }

  const result = await createSubscription(tenantId, planId);
  res.json(result);
}

// POST /billing/cancel
async function cancelHandler(req, res) {
  const tenantId = req.user?.tenantId || "default";
  await cancelSubscription(tenantId);
  res.json({ ok: true, message: "Subscription will be cancelled at end of current billing period." });
}

// POST /billing/webhook  (raw body, no auth middleware)
async function webhookHandler(req, res) {
  const signature = req.headers["x-razorpay-signature"] || "";
  try {
    const result = await handleWebhook(req.rawBody, signature);
    res.json(result);
  } catch (err) {
    console.error("[billing] webhook error:", err.message);
    res.status(400).json({ error: err.message });
  }
}

module.exports = {
  statusHandler,
  plansHandler,
  subscribeHandler,
  cancelHandler,
  webhookHandler,
};
