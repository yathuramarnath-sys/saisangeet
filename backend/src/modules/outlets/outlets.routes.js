const express = require("express");

const { requireAuth } = require("../../middleware/require-auth");
const { requirePermission } = require("../../middleware/require-permission");
const { asyncHandler } = require("../../utils/async-handler");
const { validate } = require("../../middleware/validate");
const { createOutletRules, updateOutletRules } = require("../../validators/outlets.validators");
const {
  listOutletsHandler,
  createOutletHandler,
  updateOutletSettingsHandler,
  updateOutletTablesHandler,
  requestDeleteOtpHandler,
  deleteOutletHandler,
  regenerateSyncCodeHandler,
} = require("./outlets.controller");

const outletsRouter = express.Router();

outletsRouter.get("/",  requireAuth, asyncHandler(listOutletsHandler));

outletsRouter.post(
  "/",
  requireAuth, requirePermission("outlets.manage"),
  createOutletRules, validate,
  asyncHandler(createOutletHandler)
);
outletsRouter.patch(
  "/:id/settings",
  requireAuth, requirePermission("outlets.manage"),
  updateOutletRules, validate,
  asyncHandler(updateOutletSettingsHandler)
);

// ── Tables-only update — only requireAuth (cashiers can manage tables) ──────
outletsRouter.patch(
  "/:id/tables",
  requireAuth,
  asyncHandler(updateOutletTablesHandler)
);
outletsRouter.post(
  "/:id/request-delete-otp",
  requireAuth, requirePermission("outlets.manage"),
  asyncHandler(requestDeleteOtpHandler)
);
outletsRouter.delete(
  "/:id",
  requireAuth, requirePermission("outlets.manage"),
  asyncHandler(deleteOutletHandler)
);

// ── Regenerate permanent sync code for POS / Captain App linking ─────────
outletsRouter.post(
  "/:id/sync-code/regenerate",
  requireAuth, requirePermission("outlets.manage"),
  asyncHandler(regenerateSyncCodeHandler)
);

// ── Payment method config for an outlet ──────────────────────────────────
// Body: { paymentConfig: { cash, upi, card, credit } }
outletsRouter.patch(
  "/:id/payment-config",
  requireAuth, requirePermission("outlets.manage"),
  asyncHandler(async (req, res) => {
    const { updateOutletSettings } = require("./outlets.service");
    const { paymentConfig } = req.body;
    if (!paymentConfig || typeof paymentConfig !== "object") {
      return res.status(400).json({ error: "paymentConfig object required" });
    }
    const result = await updateOutletSettings(req.params.id, { paymentConfig });
    const io       = req.app.locals.io;
    const tenantId = req.user?.tenantId || "default";
    if (io) io.to(`tenant:${tenantId}`).emit("sync:config", { type: "outlets", ts: Date.now() });
    res.json(result);
  })
);

module.exports = { outletsRouter };
