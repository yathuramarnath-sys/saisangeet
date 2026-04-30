const express = require("express");

const { requireAuth } = require("../../middleware/require-auth");
const { requirePermission } = require("../../middleware/require-permission");
const { asyncHandler } = require("../../utils/async-handler");
const { validate } = require("../../middleware/validate");
const { createUserRules, updateUserRules } = require("../../validators/users.validators");
const {
  createUserHandler,
  listUsersHandler,
  updateUserHandler,
  deleteUserHandler,
} = require("../roles/roles.controller");

const usersRouter = express.Router();

usersRouter.get("/",  requireAuth, asyncHandler(listUsersHandler));

usersRouter.post(
  "/",
  requireAuth, requirePermission("users.manage"),
  createUserRules, validate,
  asyncHandler(createUserHandler)
);
usersRouter.patch(
  "/:userId",
  requireAuth, requirePermission("users.manage"),
  updateUserRules, validate,
  asyncHandler(updateUserHandler)
);
usersRouter.delete(
  "/:userId",
  requireAuth, requirePermission("users.manage"),
  asyncHandler(deleteUserHandler)
);

module.exports = { usersRouter };
