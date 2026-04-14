const express = require("express");

const { requireAuth } = require("../../middleware/require-auth");
const { requirePermission } = require("../../middleware/require-permission");
const { asyncHandler } = require("../../utils/async-handler");
const {
  listMenuCategoriesHandler,
  listMenuItemsHandler,
  createMenuCategoryHandler,
  createMenuItemHandler
} = require("./menu.controller");

const menuRouter = express.Router();

menuRouter.get("/categories", requireAuth, asyncHandler(listMenuCategoriesHandler));
menuRouter.get("/items", requireAuth, asyncHandler(listMenuItemsHandler));
menuRouter.post(
  "/categories",
  requireAuth,
  requirePermission("menu.manage"),
  asyncHandler(createMenuCategoryHandler)
);
menuRouter.post(
  "/items",
  requireAuth,
  requirePermission("menu.manage"),
  asyncHandler(createMenuItemHandler)
);

module.exports = {
  menuRouter
};
