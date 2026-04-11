const express = require("express");

const { requireAuth } = require("../../middleware/require-auth");
const { asyncHandler } = require("../../utils/async-handler");
const { listPermissionsHandler } = require("../roles/roles.controller");

const permissionsRouter = express.Router();

permissionsRouter.get("/", requireAuth, asyncHandler(listPermissionsHandler));

module.exports = {
  permissionsRouter
};
