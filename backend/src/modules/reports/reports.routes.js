const express = require("express");

const { requireAuth } = require("../../middleware/require-auth");
const { requirePermission } = require("../../middleware/require-permission");
const { asyncHandler } = require("../../utils/async-handler");
const {
  ownerSummaryHandler,
  approveClosingHandler,
  reopenBusinessDayHandler
} = require("./reports.controller");

const reportsRouter = express.Router();

reportsRouter.get(
  "/owner-summary",
  requireAuth,
  requirePermission("reports.view"),
  asyncHandler(ownerSummaryHandler)
);
reportsRouter.post(
  "/closing/approve",
  requireAuth,
  requirePermission("reports.view"),
  asyncHandler(approveClosingHandler)
);
reportsRouter.post(
  "/closing/reopen",
  requireAuth,
  requirePermission("reports.view"),
  asyncHandler(reopenBusinessDayHandler)
);

module.exports = {
  reportsRouter
};
