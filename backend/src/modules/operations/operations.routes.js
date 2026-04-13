const express = require("express");

const { requireAuth } = require("../../middleware/require-auth");
const { requirePermission } = require("../../middleware/require-permission");
const { asyncHandler } = require("../../utils/async-handler");
const {
  listOperationsSummaryHandler,
  createDemoOrderHandler,
  listOrdersHandler,
  getOrderHandler,
  sendKotHandler,
  requestBillHandler,
  moveTableHandler,
  assignWaiterHandler,
  addOrderItemHandler,
  updateOrderItemHandler,
  splitBillHandler,
  addPaymentHandler,
  closeOrderHandler,
  approveDiscountHandler,
  approveVoidHandler,
  updateOrderStatusHandler,
  listControlLogsHandler,
  recordReprintHandler,
  requestVoidApprovalHandler
} = require("./operations.controller");

const operationsRouter = express.Router();

operationsRouter.get("/summary", requireAuth, asyncHandler(listOperationsSummaryHandler));
operationsRouter.get(
  "/control-logs",
  requireAuth,
  requirePermission("reports.view"),
  asyncHandler(listControlLogsHandler)
);
operationsRouter.post(
  "/orders/demo",
  requireAuth,
  requirePermission("operations.order.edit"),
  asyncHandler(createDemoOrderHandler)
);
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
  "/orders/:tableId/move-table",
  requireAuth,
  requirePermission("operations.order.edit"),
  asyncHandler(moveTableHandler)
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
operationsRouter.post(
  "/orders/:tableId/split-bill",
  requireAuth,
  requirePermission("operations.order.edit"),
  asyncHandler(splitBillHandler)
);
operationsRouter.post(
  "/orders/:tableId/payments",
  requireAuth,
  requirePermission("operations.order.edit"),
  asyncHandler(addPaymentHandler)
);
operationsRouter.post(
  "/orders/:tableId/close",
  requireAuth,
  requirePermission("operations.order.edit"),
  asyncHandler(closeOrderHandler)
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
  "/orders/:tableId/reprint",
  requireAuth,
  requirePermission("operations.order.edit"),
  asyncHandler(recordReprintHandler)
);
operationsRouter.post(
  "/orders/:tableId/void-request",
  requireAuth,
  requirePermission("operations.order.edit"),
  asyncHandler(requestVoidApprovalHandler)
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
