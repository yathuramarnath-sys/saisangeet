const express = require("express");

const { requireAuth }       = require("../../middleware/require-auth");
const { requirePermission } = require("../../middleware/require-permission");
const { asyncHandler }      = require("../../utils/async-handler");
const {
  getBusinessProfileHandler,
  updateBusinessProfileHandler,
} = require("./business-profile.controller");
const {
  saveSubdomain,
  getSubdomain,
  updateRestaurantName,
} = require("../billing/billing.service");

const businessProfileRouter = express.Router();

businessProfileRouter.get("/", requireAuth, asyncHandler(getBusinessProfileHandler));

businessProfileRouter.patch(
  "/",
  requireAuth,
  requirePermission("business.manage"),
  asyncHandler(updateBusinessProfileHandler)
);

// GET /business-profile/subdomain — get current subdomain for this tenant
businessProfileRouter.get("/subdomain", requireAuth, asyncHandler(async (req, res) => {
  try {
    const result = await getSubdomain(req.user.tenantId);
    res.json(result);
  } catch (_) {
    res.json({ subdomain: null, restaurantName: null });
  }
}));

// PATCH /business-profile/subdomain — set or change custom subdomain
businessProfileRouter.patch(
  "/subdomain",
  requireAuth,
  requirePermission("business.manage"),
  asyncHandler(async (req, res) => {
    const { subdomain, restaurantName } = req.body;
    if (!subdomain) return res.status(400).json({ message: "subdomain is required" });

    const saved = await saveSubdomain(req.user.tenantId, subdomain);

    // Update restaurant name in billing table if provided
    if (restaurantName) {
      await updateRestaurantName(req.user.tenantId, restaurantName).catch(() => {});
    }

    res.json({ subdomain: saved, url: `https://${saved}.dinexpos.in` });
  })
);

module.exports = {
  businessProfileRouter,
};
