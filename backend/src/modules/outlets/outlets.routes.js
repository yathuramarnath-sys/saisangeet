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
  deleteOutletHandler,
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
outletsRouter.delete(
  "/:id",
  requireAuth, requirePermission("outlets.manage"),
  asyncHandler(deleteOutletHandler)
);

module.exports = { outletsRouter };
