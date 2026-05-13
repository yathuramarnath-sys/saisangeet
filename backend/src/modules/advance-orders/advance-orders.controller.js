/**
 * advance-orders.controller.js
 *
 * Request handlers for advance order endpoints.
 */

const {
  createAdvanceOrder,
  listAdvanceOrders,
  getAdvanceOrder,
  updateAdvanceOrder,
  checkInAdvanceOrder,
  cancelAdvanceOrder,
} = require("./advance-orders-store");

// ── POST /advance-orders ──────────────────────────────────────────────────────
async function createAdvanceOrderHandler(req, res) {
  const tenantId = req.user?.tenantId || "default";
  const { outletId, ...payload } = req.body || {};

  if (!outletId)               return res.status(400).json({ error: "outletId is required" });
  if (!payload.customerName?.trim()) return res.status(400).json({ error: "customerName is required" });
  if (!payload.phone?.trim())  return res.status(400).json({ error: "phone is required" });
  if (!payload.date)           return res.status(400).json({ error: "date is required" });

  const order = createAdvanceOrder(tenantId, outletId, payload);

  // Notify owner dashboard
  const io = req.app.locals.io;
  if (io) io.to(`tenant:${tenantId}`).emit("advance-order:created", { order });

  res.status(201).json({ order });
}

// ── GET /advance-orders?outletId=&status= ─────────────────────────────────────
async function listAdvanceOrdersHandler(req, res) {
  const tenantId = req.user?.tenantId || "default";
  const { outletId, status } = req.query;

  if (!outletId) return res.status(400).json({ error: "outletId query param is required" });

  const orders = listAdvanceOrders(tenantId, outletId, { status });

  // Sort: upcoming first, cancelled last
  orders.sort((a, b) => {
    if (a.status === "cancelled" && b.status !== "cancelled") return 1;
    if (b.status === "cancelled" && a.status !== "cancelled") return -1;
    return (a.date + a.time).localeCompare(b.date + b.time);
  });

  res.json({ orders });
}

// ── PATCH /advance-orders/:id ─────────────────────────────────────────────────
async function updateAdvanceOrderHandler(req, res) {
  const tenantId = req.user?.tenantId || "default";
  const { id }   = req.params;
  const { outletId, ...patch } = req.body || {};

  if (!outletId) return res.status(400).json({ error: "outletId is required" });

  const result = updateAdvanceOrder(tenantId, outletId, id, patch);
  if (!result)         return res.status(404).json({ error: "Advance order not found" });
  if (result.error)    return res.status(400).json({ error: result.error });

  const io = req.app.locals.io;
  if (io) io.to(`tenant:${tenantId}`).emit("advance-order:updated", { order: result });

  res.json({ order: result });
}

// ── POST /advance-orders/:id/checkin ─────────────────────────────────────────
async function checkInAdvanceOrderHandler(req, res) {
  const tenantId = req.user?.tenantId || "default";
  const { id }   = req.params;
  const { outletId, assignedTableId } = req.body || {};

  if (!outletId) return res.status(400).json({ error: "outletId is required" });

  const result = checkInAdvanceOrder(tenantId, outletId, id, { assignedTableId });
  if (!result)         return res.status(404).json({ error: "Advance order not found" });
  if (result.error)    return res.status(400).json({ error: result.error });

  const io = req.app.locals.io;
  if (io) {
    io.to(`tenant:${tenantId}`).emit("advance-order:checkedin", { order: result });
    // Also broadcast to POS outlet room so POS can load the items onto the table
    if (result.outletId) {
      io.to(`outlet:${tenantId}:${result.outletId}`).emit("advance-order:checkedin", { order: result });
    }
  }

  res.json({ order: result });
}

// ── DELETE /advance-orders/:id ────────────────────────────────────────────────
async function cancelAdvanceOrderHandler(req, res) {
  const tenantId = req.user?.tenantId || "default";
  const { id }   = req.params;
  const { outletId, reason } = req.body || {};

  if (!outletId) return res.status(400).json({ error: "outletId is required" });

  const result = cancelAdvanceOrder(tenantId, outletId, id, reason || "");
  if (!result)      return res.status(404).json({ error: "Advance order not found" });
  if (result.error) return res.status(400).json({ error: result.error });

  const io = req.app.locals.io;
  if (io) io.to(`tenant:${tenantId}`).emit("advance-order:cancelled", { order: result });

  res.json({ order: result });
}

// ── GET /advance-orders/:id/print ─────────────────────────────────────────────
// Returns structured data for the POS to render a print slip.
async function printAdvanceOrderHandler(req, res) {
  const tenantId = req.user?.tenantId || "default";
  const { id }   = req.params;
  const { outletId } = req.query;

  if (!outletId) return res.status(400).json({ error: "outletId query param is required" });

  const order = getAdvanceOrder(tenantId, outletId, id);
  if (!order)   return res.status(404).json({ error: "Advance order not found" });

  const itemsTotal = (order.items || []).reduce(
    (s, i) => s + (i.price || 0) * (i.quantity || 1), 0
  );
  const balanceDue = Math.max(0, itemsTotal - (order.advanceAmount || 0));

  res.json({
    printData: {
      order,
      itemsTotal,
      balanceDue,
      printedAt: new Date().toISOString(),
    }
  });
}

module.exports = {
  createAdvanceOrderHandler,
  listAdvanceOrdersHandler,
  updateAdvanceOrderHandler,
  checkInAdvanceOrderHandler,
  cancelAdvanceOrderHandler,
  printAdvanceOrderHandler,
};
