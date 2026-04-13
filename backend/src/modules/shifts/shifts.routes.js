const express = require("express");

const { requireAuth } = require("../../middleware/require-auth");
const { requirePermission } = require("../../middleware/require-permission");
const { asyncHandler } = require("../../utils/async-handler");
const {
  shiftSummaryHandler,
  reviewCashMismatchHandler
} = require("./shifts.controller");

const shiftsRouter = express.Router();

shiftsRouter.get(
  "/summary",
  requireAuth,
  requirePermission("reports.view"),
  asyncHandler(shiftSummaryHandler)
);

shiftsRouter.post(
  "/mismatch/review",
  requireAuth,
  requirePermission("reports.view"),
  asyncHandler(reviewCashMismatchHandler)
);

module.exports = {
  shiftsRouter
};
