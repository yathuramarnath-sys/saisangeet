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
outletsRouter.delete(
  "/:id",
  requireAuth, requirePermission("outlets.manage"),
  asyncHandler(deleteOutletHandler)
);

module.exports = { outletsRouter };
