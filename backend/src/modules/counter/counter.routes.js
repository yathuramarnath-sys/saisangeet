/**
 * counter.routes.js
 * Owner-facing API for bill number and KOT settings.
 *
 * GET  /counter/config           → current counter state + bill mode
 * PATCH /counter/config          → change billMode ("fy" | "daily")
 * POST /counter/reset-bill       → reset bill counter to 0 (owner only, requires confirm)
 */

const express = require("express");
const { requireAuth }       = require("../../middleware/require-auth");
const { requirePermission } = require("../../middleware/require-permission");
const { asyncHandler }      = require("../../utils/async-handler");
const {
  getCounterConfig,
  updateCounterConfig,
  resetBillCounter,
} = require("./counter.service");

const counterRouter = express.Router();

// GET /counter/config
counterRouter.get("/config", requireAuth, asyncHandler(async (req, res) => {
  res.json(getCounterConfig(req.user.tenantId));
}));

// PATCH /counter/config — change bill mode
counterRouter.patch(
  "/config",
  requireAuth,
  requirePermission("business.manage"),
  asyncHandler(async (req, res) => {
    const { billMode } = req.body;
    if (!billMode || !["fy", "daily"].includes(billMode)) {
      return res.status(400).json({ message: 'billMode must be "fy" or "daily"' });
    }
    const result = updateCounterConfig(req.user.tenantId, { billMode });
    res.json(result);
  })
);

// POST /counter/reset-bill — reset counter to 0 (destructive, owner only)
counterRouter.post(
  "/reset-bill",
  requireAuth,
  requirePermission("business.manage"),
  asyncHandler(async (req, res) => {
    const { confirm } = req.body;
    if (confirm !== true) {
      return res.status(400).json({ message: 'Send { confirm: true } to reset the bill counter.' });
    }
    const result = resetBillCounter(req.user.tenantId);
    res.json({ ok: true, message: "Bill counter reset to 0.", config: result });
  })
);

module.exports = { counterRouter };
