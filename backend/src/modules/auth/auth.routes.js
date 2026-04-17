const express = require("express");

const { asyncHandler } = require("../../utils/async-handler");
const { requireAuth } = require("../../middleware/require-auth");
const { loginHandler, meHandler, logoutHandler } = require("./auth.controller");

const authRouter = express.Router();

authRouter.post("/login", asyncHandler(loginHandler));
authRouter.get("/me", requireAuth, meHandler);
authRouter.post("/logout", requireAuth, logoutHandler);

module.exports = {
  authRouter
};
