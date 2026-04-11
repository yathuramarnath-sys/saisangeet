const express = require("express");

const { asyncHandler } = require("../../utils/async-handler");
const { loginHandler, meHandler } = require("./auth.controller");

const authRouter = express.Router();

authRouter.post("/login", asyncHandler(loginHandler));
authRouter.get("/me", meHandler);

module.exports = {
  authRouter
};
