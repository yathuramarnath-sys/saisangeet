/**
 * advance-orders.routes.js
 *
 * POST   /advance-orders              — create
 * GET    /advance-orders?outletId=    — list (optionally filter by status)
 * PATCH  /advance-orders/:id          — edit
 * POST   /advance-orders/:id/checkin  — check in (converts to live order)
 * DELETE /advance-orders/:id          — cancel
 * GET    /advance-orders/:id/print    — get print slip data
 */

const express = require("express");
const { requireAuth } = require("../../middleware/require-auth");
const { asyncHandler } = require("../../utils/async-handler");

const {
  createAdvanceOrderHandler,
  listAdvanceOrdersHandler,
  updateAdvanceOrderHandler,
  checkInAdvanceOrderHandler,
  cancelAdvanceOrderHandler,
  printAdvanceOrderHandler,
} = require("./advance-orders.controller");

const advanceOrdersRouter = express.Router();

// All routes require authentication (device token OR owner JWT both work)
advanceOrdersRouter.use(requireAuth);

advanceOrdersRouter.post(   "/",               asyncHandler(createAdvanceOrderHandler));
advanceOrdersRouter.get(    "/",               asyncHandler(listAdvanceOrdersHandler));
advanceOrdersRouter.patch(  "/:id",            asyncHandler(updateAdvanceOrderHandler));
advanceOrdersRouter.post(   "/:id/checkin",    asyncHandler(checkInAdvanceOrderHandler));
advanceOrdersRouter.delete( "/:id",            asyncHandler(cancelAdvanceOrderHandler));
advanceOrdersRouter.get(    "/:id/print",      asyncHandler(printAdvanceOrderHandler));

module.exports = { advanceOrdersRouter };
