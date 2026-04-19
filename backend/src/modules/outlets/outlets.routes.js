const express = require("express");

const { requireAuth } = require("../../middleware/require-auth");
const { requirePermission } = require("../../middleware/require-permission");
const { asyncHandler } = require("../../utils/async-handler");
const {
  listOutletsHandler,
  createOutletHandler,
  updateOutletSettingsHandler,
  deleteOutletHandler
} = require("./outlets.controller");

const outletsRouter = express.Router();

outletsRouter.get("/", requireAuth, asyncHandler(listOutletsHandler));
outletsRouter.post(
  "/",
  requireAuth,
  requirePermission("outlets.manage"),
  asyncHandler(createOutletHandler)
);
outletsRouter.patch(
  "/:id/settings",
  requireAuth,
  requirePermission("outlets.manage"),
  asyncHandler(updateOutletSettingsHandler)
);
outletsRouter.delete(
  "/:id",
  requireAuth,
  requirePermission("outlets.manage"),
  asyncHandler(deleteOutletHandler)
);

module.exports = {
  outletsRouter
};
