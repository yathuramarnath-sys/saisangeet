const {
  getOperationsSummary,
  createDemoOperationsOrder,
  moveOrderToTable,
  getOrders,
  getOrder,
  getOrCreateOrderForTable,
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
  requestOrderVoidApproval,
  clearTableAfterSettle
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
const { getNextBillNo, getNextKotNo }      = require("../counter/counter.service");

/**
 * POST /operations/kot
 * Body: { outletId, tableId, tableNumber, kotNumber, items, orderId? }
 * Creates a KOT record, emits kot:new to the outlet socket room, and marks all items
 * sentToKot: true in the in-memory order so the backend order stays in sync with the POS.
 * Response: { kot, order? } — order is present for dine-in tables; absent for counter/online.
 */
async function deviceSendKotHandler(req, res) {
  const { outletId, tableId, tableNumber, kotNumber, items, orderId } = req.body;
  if (!outletId || !items?.length) {
    return res.status(400).json({ error: "outletId and items are required" });
  }

  const tenantId = req.user?.tenantId || "default";
  const { stationName, areaName } = req.body;

  // Always assign server-side sequential KOT number (daily reset, with IST time)
  const { kotNo, time: kotTime, date: kotDate } = getNextKotNo(tenantId);

  const kot = {
    id:          `kot-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
    kotNumber:   kotNo,        // plain sequential number e.g. 1, 2, 3
    kotTime,                   // IST time e.g. "14:32"
    kotDate,                   // IST date e.g. "2025-05-01"
    tableNumber: tableNumber || "—",
    // station and areaName are used by the KDS for station-tab filtering and display.
    // stationName comes from the POS KOT payload (grouped by item.station);
    // areaName comes from order.areaName on the POS side.
    // Defaults ensure every KOT is always displayable even when the POS omits these fields.
    station:     stationName || "Main Kitchen",
    areaName:    areaName    || tableNumber || "—",
    source:      "pos",
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

  // Mark items sentToKot: true in the in-memory order so backend state matches POS.
  // Skipped for counter/online orders — those have no backend table entry.
  let updatedOrder;
  if (tableId && !tableId.startsWith("counter-") && !tableId.startsWith("online-")) {
    try {
      updatedOrder = await sendOrderKot(tableId, { actorName: req.user?.name || "POS" });
    } catch (err) {
      // ORDER_NOT_FOUND or TABLE_NOT_FOUND — log but do not fail the KOT send.
      // The KOT is already recorded and broadcast; the order state will reconcile on next open.
      console.warn(`[KOT] markKotSent skipped for ${tableId}:`, err.message);
    }
  }

  res.status(201).json({ kot, order: updatedOrder });
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
 * Broadcasts bill:requested via socket AND marks billRequested: true in the in-memory order.
 * Response: { ok: true, order? } — order present for dine-in tables.
 */
async function deviceBillRequestHandler(req, res) {
  const { outletId, tableId } = req.body;
  const io = req.app.locals.io;
  if (io && outletId) {
    io.to(`outlet:${outletId}`).emit("bill:requested", { tableId, requestedAt: new Date().toISOString() });
  }

  let updatedOrder;
  if (tableId && !tableId.startsWith("counter-") && !tableId.startsWith("online-")) {
    try {
      updatedOrder = await requestBillForOrder(tableId, { actorName: req.user?.name || "POS" });
    } catch (err) {
      console.warn(`[bill-request] requestBill skipped for ${tableId}:`, err.message);
    }
  }

  res.json({ ok: true, order: updatedOrder });
}

/**
 * POST /operations/payment
 * Body: { outletId, orderId, tableId, method, amount, label?, reference? }
 * Broadcasts order:paid via socket AND persists the payment to the in-memory order.
 * Response: { ok: true, order? } — order present for dine-in tables.
 * addPaymentToOrder caps amount at remainingAmount and throws INVALID_PAYMENT_AMOUNT if the
 * order is already fully paid — that error is caught and swallowed (idempotent for over-pay).
 */
async function devicePaymentHandler(req, res) {
  const { outletId, tableId, method, amount, label, reference } = req.body;
  const io = req.app.locals.io;
  if (io && outletId) {
    io.to(`outlet:${outletId}`).emit("order:paid", { tableId, method, amount, paidAt: new Date().toISOString() });
  }

  let updatedOrder;
  if (tableId && !tableId.startsWith("counter-") && !tableId.startsWith("online-")) {
    try {
      updatedOrder = await addPaymentToOrder(tableId, {
        method:    method || "cash",
        label:     label  || String(method || "cash").toUpperCase(),
        amount:    Number(amount) || 0,
        reference,
        actorName: req.user?.name || "POS"
      });
    } catch (err) {
      // INVALID_PAYMENT_AMOUNT — order already fully paid or amount ≤ 0. Not a server error.
      if (err.code !== "INVALID_PAYMENT_AMOUNT") {
        console.warn(`[payment] addPayment skipped for ${tableId}:`, err.message);
      }
    }
  }

  res.json({ ok: true, order: updatedOrder });
}

/**
 * GET /operations/order?tableId=...
 * Device-bypass: no requirePermission.
 * Returns the order for the given table, creating an empty one if the table has not yet
 * started an order. This is the POS "open table" call — never returns ORDER_NOT_FOUND
 * for a valid table; throws TABLE_NOT_FOUND (404) only if the tableId is unknown.
 */
async function deviceGetOrCreateOrderHandler(req, res) {
  const { tableId } = req.query;
  if (!tableId) {
    return res.status(400).json({ error: "tableId query parameter is required" });
  }
  const result = await getOrCreateOrderForTable(tableId);
  res.json(result);
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
 * Stores the fully settled order in closed-orders-store for Owner Web sales figures,
 * then resets the in-memory slot for that table to a fresh empty order so the next
 * GET /operations/order?tableId=... returns a clean slate.
 */
async function deviceCloseOrderHandler(req, res) {
  const { outletId, order } = req.body;
  if (!outletId || !order) {
    return res.status(400).json({ error: "outletId and order are required" });
  }
  const tenantId = req.user?.tenantId || "default";

  // Assign sequential bill number (server-side, always authoritative)
  const { billNo, mode, fy, date } = getNextBillNo(tenantId);
  order.billNo     = billNo;
  order.billNoMode = mode;
  order.billNoFY   = fy   || null;
  order.billNoDate = date || null;
  order.closedAt   = new Date().toISOString(); // exact ISO timestamp

  addClosedOrder(tenantId, outletId, order);

  // Broadcast to owner dashboard listeners so the console can live-update
  const io = req.app.locals.io;
  if (io) {
    io.to(`tenant:${tenantId}`).emit("sales:updated", { outletId });
  }

  // Reset the in-memory table slot so the next table-open gets a fresh empty order.
  // clearTableAfterSettle is silent for counter/online IDs (no catalog entry).
  if (order.tableId) {
    try {
      await clearTableAfterSettle(order.tableId);
    } catch (err) {
      // Non-fatal — log and continue. Sales record already written.
      console.warn(`[close-order] table reset skipped for ${order.tableId}:`, err.message);
    }
  }

  // Return the server-assigned bill number so the POS can stamp it on the
  // printed receipt and localStorage record without a second round-trip.
  res.json({
    ok:         true,
    billNo:     order.billNo,
    billNoMode: order.billNoMode,
    billNoFY:   order.billNoFY   || null,
    billNoDate: order.billNoDate || null,
    closedAt:   order.closedAt,
  });
}

async function clearTableOrderHandler(req, res) {
  await clearTableAfterSettle(req.params.tableId);
  res.json({ ok: true, tableId: req.params.tableId, message: "Table cleared." });
}

module.exports = {
  clearTableOrderHandler,
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
  deviceGetOrCreateOrderHandler,
  deviceAddOrderItemHandler,
  deviceCloseOrderHandler,
};
