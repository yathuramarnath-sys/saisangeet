const express = require("express");

const { requireAuth } = require("../../middleware/require-auth");
const { requirePermission } = require("../../middleware/require-permission");
const { asyncHandler } = require("../../utils/async-handler");
const {
  listTaxProfilesHandler,
  createTaxProfileHandler
} = require("./tax-profiles.controller");

const taxProfilesRouter = express.Router();

taxProfilesRouter.get("/", requireAuth, asyncHandler(listTaxProfilesHandler));
taxProfilesRouter.post(
  "/",
  requireAuth,
  requirePermission("tax.manage"),
  asyncHandler(createTaxProfileHandler)
);

module.exports = {
  taxProfilesRouter
};
