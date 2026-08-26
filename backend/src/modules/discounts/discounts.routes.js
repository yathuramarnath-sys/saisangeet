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
discountsRouter.post("/", requireAuth, requirePermission("discounts.manage"), asyncHandler(createDiscountRuleHandler));
discountsRouter.patch("/:ruleId", requireAuth, requirePermission("discounts.manage"), asyncHandler(updateDiscountRuleHandler));
discountsRouter.delete("/:ruleId", requireAuth, requirePermission("discounts.manage"), asyncHandler(deleteDiscountRuleHandler));
discountsRouter.patch(
  "/approval/:policyId",
  requireAuth,
  requirePermission("discounts.manage"),
  asyncHandler(updateDiscountApprovalPolicyHandler)
);
discountsRouter.patch(
  "/defaults/config",
  requireAuth,
  requirePermission("discounts.manage"),
  asyncHandler(updateDiscountDefaultsHandler)
);

module.exports = {
  discountsRouter
};
