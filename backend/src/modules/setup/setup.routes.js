const express = require("express");

const { requireAuth } = require("../../middleware/require-auth");
const { asyncHandler } = require("../../utils/async-handler");
const { getAppConfigHandler } = require("./setup.controller");

const setupRouter = express.Router();

setupRouter.get("/app-config", requireAuth, asyncHandler(getAppConfigHandler));

module.exports = {
  setupRouter
};
