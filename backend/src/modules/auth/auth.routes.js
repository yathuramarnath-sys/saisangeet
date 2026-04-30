const express = require("express");

const { asyncHandler } = require("../../utils/async-handler");
const { requireAuth } = require("../../middleware/require-auth");
const { authLimiter } = require("../../middleware/rate-limit");
const { validate } = require("../../middleware/validate");
const {
  signupRules,
  loginRules,
  forgotPasswordRules,
  resetPasswordRules,
  changePasswordRules,
} = require("../../validators/auth.validators");
const {
  loginHandler,
  meHandler,
  logoutHandler,
  signupHandler,
  signupAvailableHandler,
  signupInterestHandler,
  changePasswordHandler,
  resetOwnerHandler,
  forgotPasswordHandler,
  resetPasswordByTokenHandler,
} = require("./auth.controller");

const authRouter = express.Router();

authRouter.get("/signup-available",  asyncHandler(signupAvailableHandler));
authRouter.post("/signup",           authLimiter, signupRules,         validate, asyncHandler(signupHandler));
authRouter.post("/signup-interest",  asyncHandler(signupInterestHandler));
authRouter.post("/login",            authLimiter, loginRules,          validate, asyncHandler(loginHandler));
authRouter.get("/me",                requireAuth, meHandler);
authRouter.post("/logout",           requireAuth, logoutHandler);
authRouter.post("/change-password",  requireAuth, changePasswordRules, validate, asyncHandler(changePasswordHandler));
authRouter.post("/reset-owner",      asyncHandler(resetOwnerHandler));

// Forgot / reset password via email token
authRouter.post("/forgot-password",  authLimiter, forgotPasswordRules, validate, asyncHandler(forgotPasswordHandler));
authRouter.post("/reset-password",   authLimiter, resetPasswordRules,  validate, asyncHandler(resetPasswordByTokenHandler));

module.exports = { authRouter };
