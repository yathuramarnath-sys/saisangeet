const express = require("express");

const { requireAuth } = require("../../middleware/require-auth");
const { requirePermission } = require("../../middleware/require-permission");
const { asyncHandler } = require("../../utils/async-handler");
const { validate } = require("../../middleware/validate");
const {
  createItemRules,
  updateItemRules,
  createCategoryRules,
  updateCategoryRules,
  bulkImportRules,
} = require("../../validators/menu.validators");
const {
  listMenuCategoriesHandler,
  listMenuItemsHandler,
  listMenuStationsHandler,
  listMenuConfigHandler,
  listMenuGroupsHandler,
  listMenuAssignmentsHandler,
  listPricingProfilesHandler,
  createMenuCategoryHandler,
  createMenuItemHandler,
  updateMenuCategoryHandler,
  createMenuStationHandler,
  updateMenuItemHandler,
  deleteMenuItemHandler,
  deleteMenuCategoryHandler,
  updateMenuConfigHandler,
  createMenuGroupHandler,
  updateMenuGroupHandler,
  createMenuAssignmentHandler,
  updateMenuAssignmentHandler,
  createPricingProfileHandler,
  updatePricingProfileHandler,
  bulkImportMenuItemsHandler,
  bulkSetUnitHandler,
  skuLookupHandler,
  getCaptainFavoritesHandler,
  saveCaptainFavoritesHandler,
  getCaptainCategoryOrderHandler,
  saveCaptainCategoryOrderHandler,
} = require("./menu.controller");

const menuRouter = express.Router();

// ── Read endpoints ────────────────────────────────────────────────────────────
menuRouter.get("/categories",      requireAuth, asyncHandler(listMenuCategoriesHandler));
menuRouter.get("/stations",        requireAuth, asyncHandler(listMenuStationsHandler));
menuRouter.get("/items",           requireAuth, asyncHandler(listMenuItemsHandler));
menuRouter.get("/config",          requireAuth, asyncHandler(listMenuConfigHandler));
menuRouter.get("/groups",          requireAuth, asyncHandler(listMenuGroupsHandler));
menuRouter.get("/assignments",     requireAuth, asyncHandler(listMenuAssignmentsHandler));
menuRouter.get("/pricing-profiles",requireAuth, asyncHandler(listPricingProfilesHandler));
menuRouter.get("/sku-lookup",      requireAuth, asyncHandler(skuLookupHandler));

// ── Write endpoints ───────────────────────────────────────────────────────────
menuRouter.post(
  "/categories",
  requireAuth, requirePermission("menu.manage"),
  createCategoryRules, validate,
  asyncHandler(createMenuCategoryHandler)
);
menuRouter.patch(
  "/categories/:id",
  requireAuth, requirePermission("menu.manage"),
  updateCategoryRules, validate,
  asyncHandler(updateMenuCategoryHandler)
);
menuRouter.delete(
  "/categories/:id",
  requireAuth, requirePermission("menu.manage"),
  asyncHandler(deleteMenuCategoryHandler)
);

menuRouter.post(
  "/stations",
  requireAuth, requirePermission("menu.manage"),
  asyncHandler(createMenuStationHandler)
);

menuRouter.post(
  "/items",
  requireAuth, requirePermission("menu.manage"),
  createItemRules, validate,
  asyncHandler(createMenuItemHandler)
);
// bulk-unit must be registered BEFORE /items/:id to avoid Express routing "bulk-unit" as an id
menuRouter.patch(
  "/items/bulk-unit",
  requireAuth, requirePermission("menu.manage"),
  asyncHandler(bulkSetUnitHandler)
);
menuRouter.patch(
  "/items/:id",
  requireAuth, requirePermission("menu.manage"),
  updateItemRules, validate,
  asyncHandler(updateMenuItemHandler)
);
menuRouter.delete(
  "/items/:id",
  requireAuth, requirePermission("menu.manage"),
  asyncHandler(deleteMenuItemHandler)
);

menuRouter.post(
  "/import",
  requireAuth, requirePermission("menu.manage"),
  bulkImportRules, validate,
  asyncHandler(bulkImportMenuItemsHandler)
);

menuRouter.post(
  "/groups",
  requireAuth, requirePermission("menu.manage"),
  asyncHandler(createMenuGroupHandler)
);
menuRouter.patch(
  "/groups/:id",
  requireAuth, requirePermission("menu.manage"),
  asyncHandler(updateMenuGroupHandler)
);

menuRouter.post(
  "/assignments",
  requireAuth, requirePermission("menu.manage"),
  asyncHandler(createMenuAssignmentHandler)
);
menuRouter.patch(
  "/assignments/:id",
  requireAuth, requirePermission("menu.manage"),
  asyncHandler(updateMenuAssignmentHandler)
);

menuRouter.patch(
  "/config",
  requireAuth, requirePermission("menu.manage"),
  asyncHandler(updateMenuConfigHandler)
);

menuRouter.post(
  "/pricing-profiles",
  requireAuth, requirePermission("menu.manage"),
  asyncHandler(createPricingProfileHandler)
);
menuRouter.patch(
  "/pricing-profiles/:id",
  requireAuth, requirePermission("menu.manage"),
  asyncHandler(updatePricingProfileHandler)
);

// Auto-assign sequential SKU numbers to all items that don't have one
menuRouter.post(
  "/auto-number",
  requireAuth, requirePermission("menu.manage"),
  asyncHandler(require("./menu.controller").autoNumberItemsHandler)
);

// ── Captain-only Favourites + category order ─────────────────────────────────
// Any authenticated staff member (captain) can curate their own outlet's
// Favourites/category order — no menu.manage permission required.
menuRouter.get("/captain/favorites",       requireAuth, asyncHandler(getCaptainFavoritesHandler));
menuRouter.put("/captain/favorites",       requireAuth, asyncHandler(saveCaptainFavoritesHandler));
menuRouter.get("/captain/category-order",  requireAuth, asyncHandler(getCaptainCategoryOrderHandler));
menuRouter.put("/captain/category-order",  requireAuth, asyncHandler(saveCaptainCategoryOrderHandler));

module.exports = { menuRouter };
