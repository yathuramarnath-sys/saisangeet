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
  requestVoidApprovalHandler,
  clearTableOrderHandler,
  // Device-friendly flat endpoints
  deviceSendKotHandler,
  deviceListKotsHandler,
  deviceUpdateKotStatusHandler,
  deviceBillRequestHandler,
  devicePaymentHandler,
  deviceGetOrCreateOrderHandler,
  deviceAddOrderItemHandler,
  deviceCloseOrderHandler,
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

// Owner-only: force-clear a stuck/test order on any table without requiring payment.
// Useful for clearing test data before handing a device to a real client.
operationsRouter.delete(
  "/orders/:tableId",
  requireAuth,
  asyncHandler(clearTableOrderHandler)
);

// ─── Device-friendly flat routes (used by POS / Captain App / KDS) ────────────
// These use requireAuth only (device tokens have no permissions array)
operationsRouter.post("/kot",          requireAuth, asyncHandler(deviceSendKotHandler));
operationsRouter.get("/kots",          requireAuth, asyncHandler(deviceListKotsHandler));
operationsRouter.patch("/kots/:id/status", requireAuth, asyncHandler(deviceUpdateKotStatusHandler));
operationsRouter.post("/bill-request", requireAuth, asyncHandler(deviceBillRequestHandler));
operationsRouter.post("/payment",      requireAuth, asyncHandler(devicePaymentHandler));
// Device get-or-create order: returns existing order or creates empty one for a known table.
// POS calls this on every table open so ORDER_NOT_FOUND is never the normal first-open path.
operationsRouter.get("/order",         requireAuth, asyncHandler(deviceGetOrCreateOrderHandler));
// Device item-add: no requirePermission — POS tokens have no permissions array.
// Counter/takeaway orders (tableId starts with "counter-") are skipped inside the handler.
operationsRouter.post("/order/item",   requireAuth, asyncHandler(deviceAddOrderItemHandler));
operationsRouter.post("/closed-order", requireAuth, asyncHandler(deviceCloseOrderHandler));

module.exports = {
  operationsRouter
};
