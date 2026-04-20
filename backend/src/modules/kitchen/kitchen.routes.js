const express = require("express");
const { requireAuth } = require("../../middleware/require-auth");
const { asyncHandler } = require("../../utils/async-handler");
const { listHandler, createHandler, updateHandler, deleteHandler } = require("./kitchen.controller");

const kitchenRouter = express.Router();

kitchenRouter.get("/",       asyncHandler(listHandler)); // public — POS reads this without auth
kitchenRouter.post("/",      requireAuth, asyncHandler(createHandler));
kitchenRouter.patch("/:id",  requireAuth, asyncHandler(updateHandler));
kitchenRouter.delete("/:id", requireAuth, asyncHandler(deleteHandler));

module.exports = { kitchenRouter };
