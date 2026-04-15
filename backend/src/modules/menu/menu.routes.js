const express = require("express");

const { requireAuth } = require("../../middleware/require-auth");
const { requirePermission } = require("../../middleware/require-permission");
const { asyncHandler } = require("../../utils/async-handler");
const {
  listMenuCategoriesHandler,
  listMenuItemsHandler,
  listMenuStationsHandler,
  createMenuCategoryHandler,
  createMenuItemHandler,
  updateMenuCategoryHandler,
  createMenuStationHandler
} = require("./menu.controller");

const menuRouter = express.Router();

menuRouter.get("/categories", requireAuth, asyncHandler(listMenuCategoriesHandler));
menuRouter.get("/stations", requireAuth, asyncHandler(listMenuStationsHandler));
menuRouter.get("/items", requireAuth, asyncHandler(listMenuItemsHandler));
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
menuRouter.patch(
  "/categories/:id",
  requireAuth,
  requirePermission("menu.manage"),
  asyncHandler(updateMenuCategoryHandler)
);

module.exports = {
  menuRouter
};
