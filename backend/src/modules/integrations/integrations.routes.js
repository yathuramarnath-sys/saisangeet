const express = require("express");

const { requireAuth } = require("../../middleware/require-auth");
const { requirePermission } = require("../../middleware/require-permission");
const { asyncHandler } = require("../../utils/async-handler");
const {
  listIntegrationsHandler,
  updateZohoBooksHandler,
  updateAccountMappingHandler,
  createVendorMappingHandler,
  updateVendorMappingHandler,
  deleteVendorMappingHandler,
  createPurchaseEntryHandler,
  runZohoSyncHandler
} = require("./integrations.controller");

const integrationsRouter = express.Router();

integrationsRouter.get("/", requireAuth, asyncHandler(listIntegrationsHandler));
integrationsRouter.patch("/zoho-books", requireAuth, requirePermission("reports.view"), asyncHandler(updateZohoBooksHandler));
integrationsRouter.patch("/account-mapping", requireAuth, requirePermission("reports.view"), asyncHandler(updateAccountMappingHandler));
integrationsRouter.post("/vendors", requireAuth, requirePermission("reports.view"), asyncHandler(createVendorMappingHandler));
integrationsRouter.patch("/vendors/:vendorId", requireAuth, requirePermission("reports.view"), asyncHandler(updateVendorMappingHandler));
integrationsRouter.delete("/vendors/:vendorId", requireAuth, requirePermission("reports.view"), asyncHandler(deleteVendorMappingHandler));
integrationsRouter.post("/purchase-entries", requireAuth, requirePermission("reports.view"), asyncHandler(createPurchaseEntryHandler));
integrationsRouter.post("/zoho-books/run-sync", requireAuth, requirePermission("reports.view"), asyncHandler(runZohoSyncHandler));

module.exports = {
  integrationsRouter
};
