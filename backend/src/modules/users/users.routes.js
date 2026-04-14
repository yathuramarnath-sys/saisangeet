const express = require("express");

const { requireAuth } = require("../../middleware/require-auth");
const { requirePermission } = require("../../middleware/require-permission");
const { asyncHandler } = require("../../utils/async-handler");
const { createUserHandler, listUsersHandler } = require("../roles/roles.controller");

const usersRouter = express.Router();

usersRouter.get("/", requireAuth, asyncHandler(listUsersHandler));
usersRouter.post(
  "/",
  requireAuth,
  requirePermission("users.manage"),
  asyncHandler(createUserHandler)
);

module.exports = {
  usersRouter
};
