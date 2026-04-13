const express = require("express");

const { requireAuth } = require("../../middleware/require-auth");
const { requirePermission } = require("../../middleware/require-permission");
const { asyncHandler } = require("../../utils/async-handler");
const {
  listOperationsSummaryHandler,
  listOrdersHandler,
  getOrderHandler,
  sendKotHandler,
  requestBillHandler,
  assignWaiterHandler,
  addOrderItemHandler,
  updateOrderItemHandler,
  approveDiscountHandler,
  approveVoidHandler,
  updateOrderStatusHandler
} = require("./operations.controller");

const operationsRouter = express.Router();

operationsRouter.get("/summary", requireAuth, asyncHandler(listOperationsSummaryHandler));
operationsRouter.get("/orders", requireAuth, asyncHandler(listOrdersHandler));
operationsRouter.get("/orders/:tableId", requireAuth, asyncHandler(getOrderHandler));
operationsRouter.post(
  "/orders/:tableId/kot",
  requireAuth,
  requirePermission("operations.kot.send"),
  asyncHandler(sendKotHandler)
);
operationsRouter.post(
  "/orders/:tableId/request-bill",
  requireAuth,
  requirePermission("operations.bill.request"),
  asyncHandler(requestBillHandler)
);
operationsRouter.post(
  "/orders/:tableId/assign-waiter",
  requireAuth,
  requirePermission("operations.waiter.assign"),
  asyncHandler(assignWaiterHandler)
);
operationsRouter.post(
  "/orders/:tableId/items",
  requireAuth,
  requirePermission("operations.order.edit"),
  asyncHandler(addOrderItemHandler)
);
operationsRouter.patch(
  "/orders/:tableId/items/:itemId",
  requireAuth,
  requirePermission("operations.order.edit"),
  asyncHandler(updateOrderItemHandler)
);
operationsRouter.post(
  "/orders/:tableId/discount-approval",
  requireAuth,
  requirePermission("operations.discount.approve"),
  asyncHandler(approveDiscountHandler)
);
operationsRouter.post(
  "/orders/:tableId/void-approval",
  requireAuth,
  requirePermission("operations.void.approve"),
  asyncHandler(approveVoidHandler)
);
operationsRouter.post(
  "/orders/:tableId/status",
  requireAuth,
  requirePermission("operations.order.status"),
  asyncHandler(updateOrderStatusHandler)
);

module.exports = {
  operationsRouter
};
