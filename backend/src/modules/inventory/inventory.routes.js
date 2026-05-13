/**
 * inventory.routes.js
 *
 * Handles the Owner Console ↔ POS sync for item visibility settings.
 *
 * POST /inventory/item-visibility
 *   Body: { itemId, posVisible, online?, outletId? }
 *
 *   - posVisible: false → mark item "sold out" on ALL POS devices for this tenant
 *   - posVisible: true  → mark item available again on all POS devices
 *   - online: false     → mark item offline for Zomato/Swiggy
 *   - Saves state to req.app.locals.outletAvailability (same map socket system uses)
 *   - Broadcasts via socket to all outlet rooms so POS/Captain/KDS update live
 *
 * GET /inventory/item-visibility
 *   Returns the current posVisible/online state for all items of this tenant.
 */

const express       = require("express");
const { requireAuth } = require("../../middleware/require-auth");
const { asyncHandler } = require("../../utils/async-handler");
const { getOwnerSetupData } = require("../../data/owner-setup-store");

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

module.exports = { inventoryRouter };
