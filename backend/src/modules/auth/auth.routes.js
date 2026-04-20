const express = require("express");

const { asyncHandler } = require("../../utils/async-handler");
const { requireAuth } = require("../../middleware/require-auth");
const { loginHandler, meHandler, logoutHandler, signupHandler, signupAvailableHandler, signupInterestHandler, changePasswordHandler, resetOwnerHandler } = require("./auth.controller");

const authRouter = express.Router();

authRouter.get("/signup-available", asyncHandler(signupAvailableHandler));
authRouter.post("/signup", asyncHandler(signupHandler));
authRouter.post("/signup-interest", asyncHandler(signupInterestHandler));
authRouter.post("/login", asyncHandler(loginHandler));
authRouter.get("/me", requireAuth, meHandler);
authRouter.post("/logout", requireAuth, logoutHandler);
authRouter.post("/change-password", requireAuth, asyncHandler(changePasswordHandler));
// One-time owner password reset — requires RESET_SECRET env var
authRouter.post("/reset-owner", asyncHandler(resetOwnerHandler));

module.exports = {
  authRouter
};
