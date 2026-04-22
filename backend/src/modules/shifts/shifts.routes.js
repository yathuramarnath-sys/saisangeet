const express = require("express");

const { requireAuth } = require("../../middleware/require-auth");
const { requirePermission } = require("../../middleware/require-permission");
const { asyncHandler } = require("../../utils/async-handler");
const {
  shiftSummaryHandler,
  openShiftHandler,
  recordMovementHandler,
  closeShiftHandler,
  reviewCashMismatchHandler
} = require("./shifts.controller");

const shiftsRouter = express.Router();

// Owner console reads
shiftsRouter.get(
  "/summary",
  requireAuth,
  requirePermission("reports.view"),
  asyncHandler(shiftSummaryHandler)
);

// POS device writes (device tokens, requireAuth only — no permission checks)
shiftsRouter.post("/open",       requireAuth, asyncHandler(openShiftHandler));
shiftsRouter.post("/movement",   requireAuth, asyncHandler(recordMovementHandler));
shiftsRouter.post("/close",      requireAuth, asyncHandler(closeShiftHandler));

shiftsRouter.post(
  "/mismatch/review",
  requireAuth,
  requirePermission("reports.view"),
  asyncHandler(reviewCashMismatchHandler)
);

module.exports = {
  shiftsRouter
};
