const express = require("express");

const { requireAuth } = require("../../middleware/require-auth");
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
discountsRouter.post("/", requireAuth, asyncHandler(createDiscountRuleHandler));
discountsRouter.patch("/:ruleId", requireAuth, asyncHandler(updateDiscountRuleHandler));
discountsRouter.delete("/:ruleId", requireAuth, asyncHandler(deleteDiscountRuleHandler));
discountsRouter.patch(
  "/approval/:policyId",
  requireAuth,
  asyncHandler(updateDiscountApprovalPolicyHandler)
);
discountsRouter.patch(
  "/defaults/config",
  requireAuth,
  asyncHandler(updateDiscountDefaultsHandler)
);

module.exports = {
  discountsRouter
};
