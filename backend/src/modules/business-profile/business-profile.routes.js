const express = require("express");

const { requireAuth } = require("../../middleware/require-auth");
const { requirePermission } = require("../../middleware/require-permission");
const { asyncHandler } = require("../../utils/async-handler");
const {
  getBusinessProfileHandler,
  updateBusinessProfileHandler
} = require("./business-profile.controller");

const businessProfileRouter = express.Router();

businessProfileRouter.get("/", requireAuth, asyncHandler(getBusinessProfileHandler));
businessProfileRouter.patch(
  "/",
  requireAuth,
  requirePermission("business.manage"),
  asyncHandler(updateBusinessProfileHandler)
);

module.exports = {
  businessProfileRouter
};
