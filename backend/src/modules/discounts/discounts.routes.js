const express = require("express");

const { requireAuth } = require("../../middleware/require-auth");
const { requirePermission } = require("../../middleware/require-permission");
const { asyncHandler } = require("../../utils/async-handler");
const {
  listDiscountSettingsHandler,
  createDiscountRuleHandler,
  updateDiscountRuleHandler,
  deleteDiscountRuleHandler,
  updateDiscountApprovalPolicyHandler,
  updateDiscountDefaultsHandler
} = require("./discounts.controller");

const discountsRouter = express.Router();

discountsRouter.get("/", requireAuth, asyncHandler(listDiscountSettingsHandler));
discountsRouter.post("/", requireAuth, requirePermission("reports.view"), asyncHandler(createDiscountRuleHandler));
discountsRouter.patch("/:ruleId", requireAuth, requirePermission("reports.view"), asyncHandler(updateDiscountRuleHandler));
discountsRouter.delete("/:ruleId", requireAuth, requirePermission("reports.view"), asyncHandler(deleteDiscountRuleHandler));
discountsRouter.patch(
  "/approval/:policyId",
  requireAuth,
  requirePermission("reports.view"),
  asyncHandler(updateDiscountApprovalPolicyHandler)
);
discountsRouter.patch(
  "/defaults/config",
  requireAuth,
  requirePermission("reports.view"),
  asyncHandler(updateDiscountDefaultsHandler)
);

module.exports = {
  discountsRouter
};
