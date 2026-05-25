/**
 * inventory.routes.js
 *
 * POST /inventory/item-visibility      — POS sold-out toggle
 * GET  /inventory/item-visibility      — current item availability state
 *
 * GET  /inventory/stock/snapshot       — POS loads on sync  ?outletId=
 * POST /inventory/stock/add            — cashier adds qty from POS
 * POST /inventory/stock/deduct         — bulk deduct on KOT send
 * GET  /inventory/stock/config         — get outlet config (allowNegative, trackedItems)
 * PUT  /inventory/stock/config         — save outlet config (owner console)
 * PUT  /inventory/stock/low-level      — set lowStockLevel per item (owner console)
 */

const express       = require("express");
const { requireAuth } = require("../../middleware/require-auth");
const { asyncHandler } = require("../../utils/async-handler");
const { getOwnerSetupData } = require("../../data/owner-setup-store");
const stockStore    = require("./stock-store");

const inventoryRouter = express.Router();
inventoryRouter.use(requireAuth);

// ── POST /inventory/item-visibility ──────────────────────────────────────────
inventoryRouter.post("/item-visibility", asyncHandler(async (req, res) => {
  const { itemId, posVisible, online, outletId: bodyOutletId } = req.body || {};

  if (!itemId) return res.status(400).json({ error: "itemId required" });

  const tenantId  = req.user?.tenantId || "default";
  const io        = req.app.locals.io;
  const avCache   = req.app.locals.outletAvailability;  // { [outletId]: { [itemId]: false } }
  const onlineCache = req.app.locals.outletOnlineEnabled; // reuse for item online state
  const data      = getOwnerSetupData(tenantId);
  const outlets   = (data?.outlets || []).filter(o => o.isActive !== false);

  // Which outlets to broadcast to
  const targetOutlets = bodyOutletId
    ? outlets.filter(o => o.id === bodyOutletId)
    : outlets;  // all outlets of this tenant

  // ── posVisible sync ────────────────────────────────────────────────────────
  if (typeof posVisible === "boolean") {
    targetOutlets.forEach(outlet => {
      const oid = outlet.id;

      // Update server-side availability cache (same one that socket system uses)
      if (!avCache[oid]) avCache[oid] = {};
      if (posVisible) {
        delete avCache[oid][itemId];
      } else {
        avCache[oid][itemId] = false;
      }

      // Broadcast to all connected POS / Captain / KDS devices in this outlet
      if (io) {
        io.to(`outlet:${tenantId}:${oid}`).emit("item:availability", {
          outletId: oid,
          itemId,
          available: posVisible,
          source: "owner-console",  // lets POS distinguish from its own toggle
        });
      }
    });
  }

  // ── online sync (future: Zomato/Swiggy) ───────────────────────────────────
  if (typeof online === "boolean") {
    targetOutlets.forEach(outlet => {
      const oid = outlet.id;
      if (io) {
        io.to(`outlet:${tenantId}:${oid}`).emit("item:online-status", {
          outletId: oid,
          itemId,
          online,
          source: "owner-console",
        });
      }
    });
  }

  res.json({ ok: true, itemId, posVisible, online, appliedTo: targetOutlets.length });
}));

// ── GET /inventory/item-visibility ───────────────────────────────────────────
// Returns the current posVisible state for all items, keyed by itemId.
// Owner Console calls this on load to restore the toggle state from server.
inventoryRouter.get("/item-visibility", asyncHandler(async (req, res) => {
  const { outletId } = req.query;
  const avCache = req.app.locals.outletAvailability || {};

  // Merge across all outlets (or just the requested one)
  const result = {};  // { [itemId]: { posVisible: bool } }

  if (outletId) {
    const cache = avCache[outletId] || {};
    for (const [id, val] of Object.entries(cache)) {
      result[id] = { posVisible: val !== false, available: val !== false };
    }
  } else {
    // Merge all outlets — if hidden in ANY outlet, report as hidden
    for (const cache of Object.values(avCache)) {
      for (const [id, val] of Object.entries(cache)) {
        if (val === false) result[id] = { posVisible: false, available: false };
      }
    }
  }

  res.json(result);
}));

// ── GET /inventory/stock/snapshot ────────────────────────────────────────────
// POS calls on load/sync to get tracked items + current stock counts.
inventoryRouter.get("/stock/snapshot", asyncHandler(async (req, res) => {
  const { outletId } = req.query;
  if (!outletId) return res.status(400).json({ error: "outletId required" });
  const tenantId = req.user?.tenantId || "default";
  const snapshot = stockStore.getPosStockSnapshot(tenantId, outletId);
  res.json(snapshot);
}));

// ── POST /inventory/stock/add ─────────────────────────────────────────────────
// Cashier adds qty from StockPanel in POS.
// Body: { outletId, itemId, qty, updatedBy? }
inventoryRouter.post("/stock/add", asyncHandler(async (req, res) => {
  const { outletId, itemId, qty, updatedBy } = req.body || {};
  if (!outletId || !itemId || qty == null) {
    return res.status(400).json({ error: "outletId, itemId, qty required" });
  }
  const tenantId = req.user?.tenantId || "default";
  const entry = stockStore.addStock(tenantId, outletId, itemId, qty, updatedBy);
  res.json(entry);
}));

// ── POST /inventory/stock/deduct ──────────────────────────────────────────────
// Called on KOT send. Body: { outletId, items: [{ itemId, quantity }] }
// Returns { blocked: [itemId], deducted: [{itemId, newStock}] }
inventoryRouter.post("/stock/deduct", asyncHandler(async (req, res) => {
  const { outletId, items } = req.body || {};
  if (!outletId || !Array.isArray(items)) {
    return res.status(400).json({ error: "outletId and items[] required" });
  }
  const tenantId = req.user?.tenantId || "default";
  const result = stockStore.deductStock(tenantId, outletId, items);
  res.json(result);
}));

// ── GET /inventory/stock/config ───────────────────────────────────────────────
inventoryRouter.get("/stock/config", asyncHandler(async (req, res) => {
  const { outletId } = req.query;
  if (!outletId) return res.status(400).json({ error: "outletId required" });
  const tenantId = req.user?.tenantId || "default";
  res.json(stockStore.getOutletConfig(tenantId, outletId));
}));

// ── PUT /inventory/stock/config ───────────────────────────────────────────────
// Owner Console saves allowNegative + trackedItems for an outlet.
// Body: { outletId, allowNegative?, trackedItems? }
inventoryRouter.put("/stock/config", asyncHandler(async (req, res) => {
  const { outletId, allowNegative, trackedItems } = req.body || {};
  if (!outletId) return res.status(400).json({ error: "outletId required" });
  const tenantId = req.user?.tenantId || "default";
  const patch = {};
  if (typeof allowNegative === "boolean") patch.allowNegative = allowNegative;
  if (Array.isArray(trackedItems)) patch.trackedItems = trackedItems;
  const cfg = stockStore.saveOutletConfig(tenantId, outletId, patch);
  res.json(cfg);
}));

// ── PUT /inventory/stock/low-level ────────────────────────────────────────────
// Set lowStockLevel per item (from ItemForm in Owner Console).
// Body: { outletId, itemId, level }  OR  { outletId, levels: [{itemId, level}] }
inventoryRouter.put("/stock/low-level", asyncHandler(async (req, res) => {
  const { outletId, itemId, level, levels } = req.body || {};
  if (!outletId) return res.status(400).json({ error: "outletId required" });
  const tenantId = req.user?.tenantId || "default";

  if (Array.isArray(levels)) {
    const results = levels.map(({ itemId: id, level: lvl }) =>
      stockStore.setLowStockLevel(tenantId, outletId, id, lvl)
    );
    return res.json(results);
  }

  if (!itemId || level == null) return res.status(400).json({ error: "itemId and level required" });
  const entry = stockStore.setLowStockLevel(tenantId, outletId, itemId, level);
  res.json(entry);
}));

module.exports = { inventoryRouter };
