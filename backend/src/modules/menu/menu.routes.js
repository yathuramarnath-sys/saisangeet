const express = require("express");

const { requireAuth } = require("../../middleware/require-auth");
const { requirePermission } = require("../../middleware/require-permission");
const { asyncHandler } = require("../../utils/async-handler");
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
  bulkImportMenuItemsHandler
} = require("./menu.controller");

const menuRouter = express.Router();

menuRouter.get("/categories", requireAuth, asyncHandler(listMenuCategoriesHandler));
menuRouter.get("/stations", requireAuth, asyncHandler(listMenuStationsHandler));
menuRouter.get("/items", requireAuth, asyncHandler(listMenuItemsHandler));
menuRouter.get("/config", requireAuth, asyncHandler(listMenuConfigHandler));
menuRouter.get("/groups", requireAuth, asyncHandler(listMenuGroupsHandler));
menuRouter.get("/assignments", requireAuth, asyncHandler(listMenuAssignmentsHandler));
menuRouter.get("/pricing-profiles", requireAuth, asyncHandler(listPricingProfilesHandler));
menuRouter.post(
  "/categories",
  requireAuth,
  requirePermission("menu.manage"),
  asyncHandler(createMenuCategoryHandler)
);
menuRouter.post(
  "/stations",
  requireAuth,
  requirePermission("menu.manage"),
  asyncHandler(createMenuStationHandler)
);
menuRouter.post(
  "/items",
  requireAuth,
  requirePermission("menu.manage"),
  asyncHandler(createMenuItemHandler)
);
menuRouter.post(
  "/import",
  requireAuth,
  requirePermission("menu.manage"),
  asyncHandler(bulkImportMenuItemsHandler)
);
menuRouter.patch(
  "/items/:id",
  requireAuth,
  requirePermission("menu.manage"),
  asyncHandler(updateMenuItemHandler)
);
menuRouter.delete(
  "/items/:id",
  requireAuth,
  requirePermission("menu.manage"),
  asyncHandler(deleteMenuItemHandler)
);
menuRouter.delete(
  "/categories/:id",
  requireAuth,
  requirePermission("menu.manage"),
  asyncHandler(deleteMenuCategoryHandler)
);
menuRouter.post(
  "/groups",
  requireAuth,
  requirePermission("menu.manage"),
  asyncHandler(createMenuGroupHandler)
);
menuRouter.patch(
  "/groups/:id",
  requireAuth,
  requirePermission("menu.manage"),
  asyncHandler(updateMenuGroupHandler)
);
menuRouter.post(
  "/assignments",
  requireAuth,
  requirePermission("menu.manage"),
  asyncHandler(createMenuAssignmentHandler)
);
menuRouter.patch(
  "/assignments/:id",
  requireAuth,
  requirePermission("menu.manage"),
  asyncHandler(updateMenuAssignmentHandler)
);
menuRouter.patch(
  "/categories/:id",
  requireAuth,
  requirePermission("menu.manage"),
  asyncHandler(updateMenuCategoryHandler)
);
menuRouter.patch(
  "/config",
  requireAuth,
  requirePermission("menu.manage"),
  asyncHandler(updateMenuConfigHandler)
);
menuRouter.post(
  "/pricing-profiles",
  requireAuth,
  requirePermission("menu.manage"),
  asyncHandler(createPricingProfileHandler)
);
menuRouter.patch(
  "/pricing-profiles/:id",
  requireAuth,
  requirePermission("menu.manage"),
  asyncHandler(updatePricingProfileHandler)
);

module.exports = {
  menuRouter
};
