const {
  getOperationsSummary,
  createDemoOperationsOrder,
  moveOrderToTable,
  getOrders,
  getOrder,
  sendOrderKot,
  requestBillForOrder,
  assignWaiterToOrder,
  addItemToOrder,
  updateOrderItemDetails,
  updateOrderSplit,
  addPaymentToOrder,
  settleOrderBill,
  approveDiscountOverride,
  approveVoidRequest,
  changeOrderStatus,
  getOperationsControlLogs,
  recordOrderReprint,
  requestOrderVoidApproval
} = require("./operations.service");

async function listOperationsSummaryHandler(_req, res) {
  const result = await getOperationsSummary();
  res.json(result);
}

async function createDemoOrderHandler(req, res) {
  const result = await createDemoOperationsOrder(req.body);
  res.status(201).json(result);
}

async function listOrdersHandler(_req, res) {
  const result = await getOrders();
  res.json(result);
}

async function getOrderHandler(req, res) {
  const result = await getOrder(req.params.tableId);
  res.json(result);
}

async function sendKotHandler(req, res) {
  const result = await sendOrderKot(req.params.tableId, req.body);
  res.json(result);
}

async function requestBillHandler(req, res) {
  const result = await requestBillForOrder(req.params.tableId, req.body);
  res.json(result);
}

async function moveTableHandler(req, res) {
  const result = await moveOrderToTable(req.params.tableId, req.body);
  res.json(result);
}

async function assignWaiterHandler(req, res) {
  const result = await assignWaiterToOrder(req.params.tableId, req.body);
  res.json(result);
}

async function addOrderItemHandler(req, res) {
  const result = await addItemToOrder(req.params.tableId, req.body);
  res.status(201).json(result);
}

async function updateOrderItemHandler(req, res) {
  const result = await updateOrderItemDetails(req.params.tableId, req.params.itemId, req.body);
  res.json(result);
}

async function splitBillHandler(req, res) {
  const result = await updateOrderSplit(req.params.tableId, req.body);
  res.json(result);
}

async function addPaymentHandler(req, res) {
  const result = await addPaymentToOrder(req.params.tableId, req.body);
  res.status(201).json(result);
}

async function closeOrderHandler(req, res) {
  const result = await settleOrderBill(req.params.tableId, req.body);
  res.json(result);
}

async function approveDiscountHandler(req, res) {
  const result = await approveDiscountOverride(req.params.tableId, req.body);
  res.json(result);
}

async function approveVoidHandler(req, res) {
  const result = await approveVoidRequest(req.params.tableId, req.body);
  res.json(result);
}

async function updateOrderStatusHandler(req, res) {
  const result = await changeOrderStatus(req.params.tableId, req.body);
  res.json(result);
}

async function listControlLogsHandler(_req, res) {
  const result = await getOperationsControlLogs();
  res.json(result);
}

async function recordReprintHandler(req, res) {
  const result = await recordOrderReprint(req.params.tableId, req.body);
  res.status(201).json(result);
}

async function requestVoidApprovalHandler(req, res) {
  const result = await requestOrderVoidApproval(req.params.tableId, req.body);
  res.json(result);
}

// ─── Device-friendly flat endpoints (used by POS / Captain / KDS) ─────────────

const { getKots, addKot, updateKotStatus } = require("./kot-store");

/**
 * POST /operations/kot
 * Body: { outletId, tableId, tableNumber, kotNumber, items, orderId? }
 * Creates a KOT and emits kot:new to the outlet socket room.
 */
async function deviceSendKotHandler(req, res) {
  const { outletId, tableId, tableNumber, kotNumber, items, orderId } = req.body;
  if (!outletId || !items?.length) {
    return res.status(400).json({ error: "outletId and items are required" });
  }

  const tenantId = req.user?.tenantId || "default";
  const kot = {
    id:          `kot-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
    kotNumber:   kotNumber || `KOT-${Date.now()}`,
    tableNumber: tableNumber || "—",
    source:      req.user?.type === "device" ? "pos" : "pos",
    status:      "new",
    createdAt:   new Date().toISOString(),
    items:       (items || []).map((i, idx) => ({
      id:       i.id || `item-${idx}`,
      name:     i.name,
      quantity: i.quantity,
      note:     i.note || ""
    })),
    tableId,
    orderId
  };

  addKot(tenantId, outletId, kot);

  // Broadcast to KDS and Captain in this outlet
  const io = req.app.locals.io;
  if (io) {
    io.to(`outlet:${outletId}`).emit("kot:new", kot);
    io.to(`outlet:${outletId}`).emit("kot:sent", { tableId, kotId: kot.id });
  }

  res.status(201).json(kot);
}

/**
 * GET /operations/kots?outletId=...
 * Returns all active (non-bumped) KOTs for the outlet.
 */
async function deviceListKotsHandler(req, res) {
  const { outletId } = req.query;
  if (!outletId) return res.status(400).json({ error: "outletId is required" });
  const tenantId = req.user?.tenantId || "default";
  res.json(getKots(tenantId, outletId));
}

/**
 * PATCH /operations/kots/:id/status
 * Body: { status } — "preparing" | "ready" | "bumped"
 */
async function deviceUpdateKotStatusHandler(req, res) {
  const { outletId } = req.query;
  const { status } = req.body;
  const tenantId = req.user?.tenantId || "default";
  const updated = updateKotStatus(tenantId, outletId, req.params.id, status);
  if (!updated && status !== "bumped") {
    return res.status(404).json({ error: "KOT not found" });
  }
  const io = req.app.locals.io;
  if (io && outletId) {
    io.to(`outlet:${outletId}`).emit("kot:status", { id: req.params.id, status });
  }
  res.json(updated || { id: req.params.id, status });
}

/**
 * POST /operations/bill-request
 * Body: { outletId, tableId }
 */
async function deviceBillRequestHandler(req, res) {
  const { outletId, tableId } = req.body;
  const io = req.app.locals.io;
  if (io && outletId) {
    io.to(`outlet:${outletId}`).emit("bill:requested", { tableId, requestedAt: new Date().toISOString() });
  }
  res.json({ ok: true });
}

/**
 * POST /operations/payment
 * Body: { outletId, orderId, tableId, method, amount, reference }
 * Records a payment (acknowledged; no persistent storage in this in-memory build).
 */
async function devicePaymentHandler(req, res) {
  const { outletId, tableId, method, amount } = req.body;
  const io = req.app.locals.io;
  if (io && outletId) {
    io.to(`outlet:${outletId}`).emit("order:paid", { tableId, method, amount, paidAt: new Date().toISOString() });
  }
  res.json({ ok: true });
}

/**
 * POST /operations/order/item
 * Body: { tableId, outletId, item: { menuItemId, name, price, quantity, note?, seatLabel? } }
 * Device-bypass: no requirePermission — POS device tokens have no permissions array.
 * Adds one item to an existing in-memory order and persists state.
 * Counter/takeaway orders (tableId starts with "counter-") are skipped gracefully.
 */
async function deviceAddOrderItemHandler(req, res) {
  const { tableId, item } = req.body;
  if (!tableId || !item?.menuItemId) {
    return res.status(400).json({ error: "tableId and item.menuItemId are required" });
  }
  // Counter/takeaway orders are managed locally on the POS and have no backend table entry
  if (tableId.startsWith("counter-")) {
    return res.json({ ok: true, skipped: true });
  }
  // Merge actor name into payload so operations.service.resolveActor picks it up
  const actor = req.user?.name || req.user?.type || "POS";
  const result = await addItemToOrder(tableId, { ...item, actorName: actor });
  res.status(201).json(result);
}

const { addClosedOrder } = require("./closed-orders-store");

/**
 * POST /operations/closed-order
 * Body: { outletId, order }
 * Stores a fully settled order so Owner Web can read real sales figures.
 */
async function deviceCloseOrderHandler(req, res) {
  const { outletId, order } = req.body;
  if (!outletId || !order) {
    return res.status(400).json({ error: "outletId and order are required" });
  }
  const tenantId = req.user?.tenantId || "default";
  addClosedOrder(tenantId, outletId, order);

  // Broadcast to owner dashboard listeners so the console can live-update
  const io = req.app.locals.io;
  if (io) {
    io.to(`tenant:${tenantId}`).emit("sales:updated", { outletId });
  }
  res.json({ ok: true });
}

module.exports = {
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
  // Device-friendly flat endpoints
  deviceSendKotHandler,
  deviceListKotsHandler,
  deviceUpdateKotStatusHandler,
  deviceBillRequestHandler,
  devicePaymentHandler,
  deviceAddOrderItemHandler,
  deviceCloseOrderHandler,
};
