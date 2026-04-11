const express = require("express");

const { requireAuth } = require("../../middleware/require-auth");
const { requirePermission } = require("../../middleware/require-permission");
const { asyncHandler } = require("../../utils/async-handler");
const {
  listReceiptTemplatesHandler,
  createReceiptTemplateHandler
} = require("./receipt-templates.controller");

const receiptTemplatesRouter = express.Router();

receiptTemplatesRouter.get("/", requireAuth, asyncHandler(listReceiptTemplatesHandler));
receiptTemplatesRouter.post(
  "/",
  requireAuth,
  requirePermission("receipt_templates.manage"),
  asyncHandler(createReceiptTemplateHandler)
);

module.exports = {
  receiptTemplatesRouter
};
