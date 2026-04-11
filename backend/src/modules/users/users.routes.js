const express = require("express");

const { requireAuth } = require("../../middleware/require-auth");
const { requirePermission } = require("../../middleware/require-permission");
const { asyncHandler } = require("../../utils/async-handler");
const { createUserHandler } = require("../roles/roles.controller");

const usersRouter = express.Router();

usersRouter.post(
  "/",
  requireAuth,
  requirePermission("users.manage"),
  asyncHandler(createUserHandler)
);

module.exports = {
  usersRouter
};
