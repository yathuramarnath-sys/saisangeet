const express = require("express");

const { requireAuth } = require("../../middleware/require-auth");
const { requirePermission } = require("../../middleware/require-permission");
const { asyncHandler } = require("../../utils/async-handler");
const {
  listTaxProfilesHandler,
  createTaxProfileHandler,
  updateTaxProfileHandler,
  deleteTaxProfileHandler,
} = require("./tax-profiles.controller");

const taxProfilesRouter = express.Router();

taxProfilesRouter.get("/", requireAuth, asyncHandler(listTaxProfilesHandler));
taxProfilesRouter.post(
  "/",
  requireAuth,
  requirePermission("tax.manage"),
  asyncHandler(createTaxProfileHandler)
);
taxProfilesRouter.patch(
  "/:id",
  requireAuth,
  requirePermission("tax.manage"),
  asyncHandler(updateTaxProfileHandler)
);
taxProfilesRouter.delete(
  "/:id",
  requireAuth,
  requirePermission("tax.manage"),
  asyncHandler(deleteTaxProfileHandler)
);

module.exports = {
  taxProfilesRouter
};
