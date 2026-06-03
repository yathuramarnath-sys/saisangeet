const express = require("express");

const { requireAuth } = require("../../middleware/require-auth");
const { requirePermission } = require("../../middleware/require-permission");
const { asyncHandler } = require("../../utils/async-handler");
const { validate } = require("../../middleware/validate");
const { createKotRules, closeOrderRules } = require("../../validators/operations.validators");
const {
  listOperationsSummaryHandler,
  createDemoOrderHandler,
  listOrdersHandler,
  getOrderHandler,
  sendKotHandler,
  requestBillHandler,
  moveTableHandler,
  mergeTablesHandler,
  assignWaiterHandler,
  updateGuestsHandler,
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
  recordSplitBillHandler,
  assignBillNoHandler,
  devicePaymentHandler,
  deviceGetOrCreateOrderHandler,
  deviceAddOrderItemHandler,
  deviceRemoveOrderItemHandler,
  deviceVoidOrderItemHandler,
  deviceCloseOrderHandler,
  clearAllOrdersHandler,
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
  asyncHandler(moveTableHandler)
);
operationsRouter.post(
  "/orders/:tableId/merge-from",
  requireAuth,
  asyncHandler(mergeTablesHandler)
);
operationsRouter.post(
  "/orders/:tableId/assign-waiter",
  requireAuth,
  requirePermission("operations.waiter.assign"),
  asyncHandler(assignWaiterHandler)
);
operationsRouter.post(
  "/orders/:tableId/guests",
  requireAuth,
  asyncHandler(updateGuestsHandler)
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

// Owner-only: clear ALL active orders for an outlet at once.
// Query: ?outletId=<uuid>  — used to wipe test/stale data in one call.
operationsRouter.delete(
  "/orders",
  requireAuth,
  asyncHandler(clearAllOrdersHandler)
);

// ─── Device-friendly flat routes (used by POS / Captain App / KDS) ────────────
// These use requireAuth only (device tokens have no permissions array)
operationsRouter.post("/kot",          requireAuth, createKotRules, validate, asyncHandler(deviceSendKotHandler));
operationsRouter.get("/kots",          requireAuth, asyncHandler(deviceListKotsHandler));
operationsRouter.patch("/kots/:id/status", requireAuth, asyncHandler(deviceUpdateKotStatusHandler));
operationsRouter.post("/bill-request",      requireAuth, asyncHandler(deviceBillRequestHandler));
operationsRouter.post("/split-bill-record", requireAuth, asyncHandler(recordSplitBillHandler));
operationsRouter.post("/assign-bill-no",    requireAuth, asyncHandler(assignBillNoHandler));
operationsRouter.post("/payment",        requireAuth, asyncHandler(devicePaymentHandler));
// Device get-or-create order: returns existing order or creates empty one for a known table.
// POS calls this on every table open so ORDER_NOT_FOUND is never the normal first-open path.
operationsRouter.get("/order",         requireAuth, asyncHandler(deviceGetOrCreateOrderHandler));
// Device item-add: no requirePermission — POS tokens have no permissions array.
// Counter/takeaway orders (tableId starts with "counter-") are skipped inside the handler.
operationsRouter.post("/order/item",   requireAuth, asyncHandler(deviceAddOrderItemHandler));
operationsRouter.delete("/order/item", requireAuth, asyncHandler(deviceRemoveOrderItemHandler));
operationsRouter.patch("/order/item",  requireAuth, asyncHandler(deviceVoidOrderItemHandler));
operationsRouter.post("/closed-order", requireAuth, closeOrderRules, validate, asyncHandler(deviceCloseOrderHandler));

// ── Action logs (void / cancel-order / bill-reprint) ─────────────────────────
// POST /operations/void-log     — called by POS after PIN-confirmed void or cancel
// POST /operations/reprint-log  — called by POS and Captain App on every bill reprint
// GET  /operations/action-logs  — called by Owner Console reports
operationsRouter.post("/void-log", requireAuth, asyncHandler(async (req, res) => {
  const { addActionLog } = require("./action-log-store");
  const tenantId = req.user?.tenantId || "default";
  const { type = "void_item", cashier, outletName, tableId, tableLabel, orderNumber, items } = req.body;
  const entry = addActionLog(tenantId, { type, cashier, outletName, tableId, tableLabel, orderNumber, items: items || [] });
  res.status(201).json(entry);
}));

operationsRouter.post("/reprint-log", requireAuth, asyncHandler(async (req, res) => {
  const { addActionLog } = require("./action-log-store");
  const tenantId = req.user?.tenantId || "default";
  const { source = "pos", cashier, outletName, tableLabel, orderNumber, billNo } = req.body;
  const entry = addActionLog(tenantId, {
    type: "bill_reprint", source, cashier, outletName, tableLabel, orderNumber, billNo,
  });
  res.status(201).json(entry);
}));

operationsRouter.get("/action-logs", requireAuth, asyncHandler(async (req, res) => {
  const { getActionLogs } = require("./action-log-store");
  const tenantId = req.user?.tenantId || "default";
  const { types, dateFrom, dateTo } = req.query;
  const typeArr = types ? types.split(",") : [];
  const logs = getActionLogs(tenantId, { types: typeArr, dateFrom, dateTo });
  res.json(logs);
}));

// ── Credit sales ──────────────────────────────────────────────────────────────
// GET  /operations/credits          — all credit orders (unpaid + paid) for this tenant
// POST /operations/credits/:id/settle — mark a credit order as paid
operationsRouter.get("/credits", requireAuth, asyncHandler(async (req, res) => {
  const { getCreditOrders } = require("./closed-orders-store");
  const tenantId = req.user?.tenantId || "default";
  const { outletId = null, dateFrom = null, dateTo = null } = req.query;
  const orders = await getCreditOrders(tenantId, outletId || null, dateFrom || null, dateTo || null);
  res.json(orders);
}));

operationsRouter.post("/credits/:id/settle", requireAuth, asyncHandler(async (req, res) => {
  const { settleCreditOrder } = require("./closed-orders-store");
  const tenantId = req.user?.tenantId || "default";
  const orderId  = req.params.id;
  const { method = "cash", reference = null, settledBy = null } = req.body;
  const updated  = await settleCreditOrder(tenantId, orderId, { method, reference, settledBy });
  if (!updated) return res.status(404).json({ error: "Credit order not found" });
  // Notify owner console
  const io = req.app.locals.io;
  if (io) io.to(`tenant:${tenantId}`).emit("credits:updated");
  res.json({ ok: true, order: updated });
}));

// POST /operations/credits/settle-customer — settle ALL unpaid bills for a customer in one call
operationsRouter.post("/credits/settle-customer", requireAuth, asyncHandler(async (req, res) => {
  const { settleCreditOrder, getCreditOrders } = require("./closed-orders-store");
  const tenantId   = req.user?.tenantId || "default";
  const { customerName, method = "cash", reference = null, settledBy = null } = req.body;
  if (!customerName?.trim()) return res.status(400).json({ error: "customerName required" });

  const allOrders = await getCreditOrders(tenantId, null, null, null);
  const unpaid = allOrders.filter(o =>
    o.creditStatus !== "paid" &&
    (o.creditCustomer?.name || "").trim().toLowerCase() === customerName.trim().toLowerCase()
  );
  if (!unpaid.length) return res.status(404).json({ error: "No unpaid bills found for this customer" });

  const settled = [];
  for (const order of unpaid) {
    const id = order.id || order.orderNumber;
    const result = await settleCreditOrder(tenantId, id, { method, reference, settledBy });
    if (result) settled.push(id);
  }

  const io = req.app.locals.io;
  if (io) io.to(`tenant:${tenantId}`).emit("credits:updated");
  res.json({ ok: true, settledCount: settled.length, settledIds: settled });
}));

// Action log — Owner Console audit trail
operationsRouter.get("/action-logs",   requireAuth, asyncHandler(async (req, res) => {
  const { getActionLogs } = require("../action-log/actionLog.service");
  const tenantId = req.user?.tenantId || "default";
  const { outletId, tableId, action: actionFilter, limit } = req.query;
  const logs = getActionLogs(tenantId, {
    outletId,
    tableId,
    action:    actionFilter,
    limit:     limit ? Number(limit) : 200,
  });
  res.json(logs);
}));

// ── Day End Report ────────────────────────────────────────────────────────────
// GET /operations/day-end?outletId=xxx
// Returns today's sales summary: totals, payment breakdown, top 5 items, category sales
operationsRouter.get("/day-end", requireAuth, asyncHandler(async (req, res) => {
  const { getTodaySalesByOutlet } = require("./closed-orders-store");
  const tenantId = req.user?.tenantId || "default";
  const { outletId } = req.query;

  const orders = getTodaySalesByOutlet(tenantId, outletId);

  // ── Totals ────────────────────────────────────────────────────────────────
  let totalBills    = orders.length;
  let totalSales    = 0;
  let totalDiscount = 0;
  let totalVoidComp = 0;
  const paymentTotals = {};
  const itemSales     = {};  // itemName → { qty, revenue }
  const catSales      = {};  // categoryName → revenue

  for (const order of orders) {
    const items    = order.items || [];
    const payments = order.payments || [];

    // Payment breakdown
    for (const p of payments) {
      const method = p.method || "cash";
      paymentTotals[method] = (paymentTotals[method] || 0) + Number(p.amount || 0);
    }

    // Items
    for (const item of items) {
      if (item.isVoided || item.isGhostVoid) {
        totalVoidComp += Number(item.price || 0) * Number(item.quantity || 1);
        continue;
      }
      if (item.isComp) {
        totalVoidComp += Number(item.price || 0) * Number(item.quantity || 1);
        continue;
      }
      const qty = Number(item.quantity || 1);
      const rev = Number(item.price || 0) * qty;
      totalSales += rev;

      // Top items
      const key = item.name || "Unknown";
      if (!itemSales[key]) itemSales[key] = { qty: 0, revenue: 0 };
      itemSales[key].qty     += qty;
      itemSales[key].revenue += rev;

      // Category sales
      const cat = item.categoryName || item.category || "Other";
      catSales[cat] = (catSales[cat] || 0) + rev;
    }

    totalDiscount += Number(order.discountAmount || 0);
  }

  // Top 5 items by quantity
  const top5 = Object.entries(itemSales)
    .sort((a, b) => b[1].qty - a[1].qty)
    .slice(0, 5)
    .map(([name, { qty, revenue }]) => ({ name, qty, revenue }));

  // Category breakdown sorted by revenue
  const categories = Object.entries(catSales)
    .sort((a, b) => b[1] - a[1])
    .map(([name, revenue]) => ({ name, revenue }));

  res.json({
    date:          new Date().toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "2-digit", year: "numeric" }),
    totalBills,
    totalSales,
    totalDiscount,
    totalVoidComp,
    paymentTotals,
    top5,
    categories,
  });
}));

module.exports = {
  operationsRouter
};
