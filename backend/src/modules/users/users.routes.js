const express = require("express");

const { requireAuth } = require("../../middleware/require-auth");
const { requirePermission } = require("../../middleware/require-permission");
const { asyncHandler } = require("../../utils/async-handler");
const {
  createUserHandler,
  listUsersHandler,
  updateUserHandler,
  deleteUserHandler
} = require("../roles/roles.controller");

const usersRouter = express.Router();

usersRouter.get("/", requireAuth, asyncHandler(listUsersHandler));
usersRouter.post(
  "/",
  requireAuth,
  requirePermission("users.manage"),
  asyncHandler(createUserHandler)
);
usersRouter.patch(
  "/:userId",
  requireAuth,
  requirePermission("users.manage"),
  asyncHandler(updateUserHandler)
);
usersRouter.delete(
  "/:userId",
  requireAuth,
  requirePermission("users.manage"),
  asyncHandler(deleteUserHandler)
);

module.exports = {
  usersRouter
};
