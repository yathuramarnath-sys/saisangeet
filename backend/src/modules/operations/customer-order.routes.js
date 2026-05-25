/**
 * customer-order.routes.js
 * Handles QR-submitted customer orders.
 *
 * POST   /operations/customer-order          — customer submits order (no auth)
 * GET    /operations/customer-orders         — captain fetches pending list (auth)
 * PATCH  /operations/customer-order/:id/accept  — captain accepts → items added to table
 * PATCH  /operations/customer-order/:id/reject  — captain rejects
 */
const express       = require("express");
const { requireAuth } = require("../../middleware/require-auth");
const { asyncHandler } = require("../../utils/async-handler");
const store         = require("./customer-order-store");
const { createOrderItem, fetchOrCreateOrderByTable } = require("./operations.repository");
const { runWithTenant } = require("../../data/tenant-context");

const router = express.Router();

// ── POST — customer submits (public, no auth) ─────────────────────────────────
router.post("/", asyncHandler(async (req, res) => {
  const { tenantId, outletId, tableId, tableLabel, customerName, customerPhone, items } = req.body || {};

  if (!outletId || !tableId)      return res.status(400).json({ error: "outletId and tableId required" });
  if (!customerName?.trim())      return res.status(400).json({ error: "Customer name required" });
  if (!Array.isArray(items) || !items.length) return res.status(400).json({ error: "At least one item required" });

  const tid   = tenantId || "default";
  const entry = store.createOrder(tid, { outletId, tableId, tableLabel, customerName, customerPhone, items });

  // Emit to captain + POS devices in this outlet room
  const io = req.app.locals.io;
  if (io) {
    io.to(`outlet:${tid}:${outletId}`).emit("customer:order:new", entry);
  }

  res.status(201).json(entry);
}));

// ── GET — captain fetches pending list ────────────────────────────────────────
router.get("/", requireAuth, asyncHandler(async (req, res) => {
  const { outletId } = req.query;
  if (!outletId) return res.status(400).json({ error: "outletId required" });
  const tenantId = req.user?.tenantId || "default";
  res.json(store.getPendingOrders(tenantId, outletId));
}));

// ── PATCH accept ──────────────────────────────────────────────────────────────
// 1. Mark order accepted in customer-order store
// 2. Add each item to the table's in-memory order (so captain sees them + can send KOT)
// 3. Emit order:updated so all devices sync instantly
router.patch("/:id/accept", requireAuth, asyncHandler(async (req, res) => {
  const tenantId = req.user?.tenantId || "default";
  const entry = store.updateStatus(tenantId, req.params.id, "accepted");
  if (!entry) return res.status(404).json({ error: "Order not found" });

  const io = req.app.locals.io;
  const actorName = `${entry.customerName} (QR)`;

  // Add items to table order inside tenant context
  let updatedOrder = null;
  try {
    await runWithTenant(tenantId, async () => {
      // Ensure table order exists
      await fetchOrCreateOrderByTable(entry.tableId).catch(() => null);

      // Add each item
      for (const item of entry.items) {
        const result = await createOrderItem(entry.tableId, {
          id:           item.id,
          menuItemId:   item.id,
          name:         item.name,
          price:        item.price,
          quantity:     item.quantity || 1,
          note:         item.notes || "",
          categoryName: item.categoryName || "",
        }, actorName).catch(() => null);
        if (result) updatedOrder = result;
      }
    });
  } catch (err) {
    console.warn("[customer-order] accept: could not add items to table order:", err.message);
  }

  // Emit order:updated so POS + Captain App floors refresh
  if (io && updatedOrder) {
    io.to(`outlet:${tenantId}:${entry.outletId}`).emit("order:updated", updatedOrder);
  }
  // Emit accepted event so customer-web can show confirmation (future)
  if (io) {
    io.to(`outlet:${tenantId}:${entry.outletId}`).emit("customer:order:accepted", {
      id: entry.id, tableId: entry.tableId
    });
  }

  res.json({ ...entry, order: updatedOrder });
}));

// ── PATCH reject ──────────────────────────────────────────────────────────────
router.patch("/:id/reject", requireAuth, asyncHandler(async (req, res) => {
  const tenantId = req.user?.tenantId || "default";
  const entry = store.updateStatus(tenantId, req.params.id, "rejected");
  if (!entry) return res.status(404).json({ error: "Order not found" });

  const io = req.app.locals.io;
  if (io) {
    io.to(`outlet:${tenantId}:${entry.outletId}`).emit("customer:order:rejected", { id: entry.id, tableId: entry.tableId });
  }

  res.json(entry);
}));

module.exports = router;
