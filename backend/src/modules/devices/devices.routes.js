const express = require("express");

const { requireAuth } = require("../../middleware/require-auth");
const { requirePermission } = require("../../middleware/require-permission");
const { asyncHandler } = require("../../utils/async-handler");
const { linkCodeLimiter } = require("../../middleware/rate-limit");
const { validate } = require("../../middleware/validate");
const { resolveLinkCodeRules, createLinkTokenRules } = require("../../validators/devices.validators");
const {
  listDevicesHandler,
  createLinkTokenHandler,
  linkDeviceHandler,
  updateDeviceStatusHandler,
  resolveLinkCodeHandler,
  fetchStaffHandler,
} = require("./devices.controller");

const devicesRouter = express.Router();

devicesRouter.get("/", requireAuth, asyncHandler(listDevicesHandler));
devicesRouter.post(
  "/link-token",
  requireAuth,
  requirePermission("devices.manage"),
  createLinkTokenRules, validate,
  asyncHandler(createLinkTokenHandler)
);
// Public — no auth — rate-limited + input validated
devicesRouter.post(
  "/resolve-link-code",
  linkCodeLimiter,
  resolveLinkCodeRules, validate,
  asyncHandler(resolveLinkCodeHandler)
);

// Device-auth — returns live staff list for the linked outlet (no re-link needed)
devicesRouter.get("/staff", requireAuth, asyncHandler(fetchStaffHandler));

devicesRouter.post("/link", requireAuth, asyncHandler(linkDeviceHandler));
devicesRouter.patch(
  "/:id/status",
  requireAuth,
  requirePermission("devices.manage"),
  asyncHandler(updateDeviceStatusHandler)
);

module.exports = {
  devicesRouter
};
