const express = require("express");

const { requireAuth } = require("../../middleware/require-auth");
const { requirePermission } = require("../../middleware/require-permission");
const { asyncHandler } = require("../../utils/async-handler");
const {
  listDevicesHandler,
  createLinkTokenHandler,
  linkDeviceHandler,
  updateDeviceStatusHandler,
  resolveLinkCodeHandler,
} = require("./devices.controller");

const devicesRouter = express.Router();

devicesRouter.get("/", requireAuth, asyncHandler(listDevicesHandler));
devicesRouter.post(
  "/link-token",
  requireAuth,
  requirePermission("devices.manage"),
  asyncHandler(createLinkTokenHandler)
);
// Public — no auth — called by POS / Captain App / KDS on first launch
devicesRouter.post("/resolve-link-code", asyncHandler(resolveLinkCodeHandler));

devicesRouter.post("/link", asyncHandler(linkDeviceHandler));
devicesRouter.patch(
  "/:id/status",
  requireAuth,
  requirePermission("devices.manage"),
  asyncHandler(updateDeviceStatusHandler)
);

module.exports = {
  devicesRouter
};
