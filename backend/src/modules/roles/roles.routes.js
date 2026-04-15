const express = require("express");

const { requireAuth } = require("../../middleware/require-auth");
const { requirePermission } = require("../../middleware/require-permission");
const { asyncHandler } = require("../../utils/async-handler");
const {
  listRolesHandler,
  createRoleHandler,
  updateRoleHandler,
  deleteRoleHandler
} = require("./roles.controller");

const rolesRouter = express.Router();

rolesRouter.get("/", requireAuth, asyncHandler(listRolesHandler));
rolesRouter.post(
  "/",
  requireAuth,
  requirePermission("roles.manage"),
  asyncHandler(createRoleHandler)
);
rolesRouter.patch(
  "/:roleId",
  requireAuth,
  requirePermission("roles.manage"),
  asyncHandler(updateRoleHandler)
);
rolesRouter.delete(
  "/:roleId",
  requireAuth,
  requirePermission("roles.manage"),
  asyncHandler(deleteRoleHandler)
);

module.exports = {
  rolesRouter
};
