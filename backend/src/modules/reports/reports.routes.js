const express = require("express");

const { requireAuth } = require("../../middleware/require-auth");
const { requirePermission } = require("../../middleware/require-permission");
const { asyncHandler } = require("../../utils/async-handler");
const {
  ownerSummaryHandler,
  approveClosingHandler,
  reopenBusinessDayHandler,
  listOrderHistoryHandler
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

// GET /reports/orders — paginated bill list (today from memory, history from Postgres)
reportsRouter.get(
  "/orders",
  requireAuth,
  requirePermission("reports.view"),
  asyncHandler(listOrderHistoryHandler)
);

module.exports = {
  reportsRouter
};
