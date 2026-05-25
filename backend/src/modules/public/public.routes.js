/**
 * public.routes.js
 * NO-AUTH public endpoints — used by the customer QR ordering web app.
 *
 * GET /public/outlet?outletId=   — outlet name + table list
 * GET /public/menu?outletId=     — menu categories + items (active only)
 */
const express = require("express");
const { asyncHandler } = require("../../utils/async-handler");
const { getOwnerSetupData } = require("../../data/owner-setup-store");

const publicRouter = express.Router();

// ── GET /public/outlet ────────────────────────────────────────────────────────
publicRouter.get("/outlet", asyncHandler(async (req, res) => {
  const { outletId, tenantId } = req.query;
  if (!outletId) return res.status(400).json({ error: "outletId required" });

  // Try to find outlet across all tenants (customer doesn't know tenantId)
  // tenantId can be passed in QR link as optional hint for faster lookup
  const tids = tenantId ? [tenantId] : ["default"];

  for (const tid of tids) {
    const data   = getOwnerSetupData(tid);
    const outlet = (data?.outlets || []).find(o => o.id === outletId && o.isActive !== false);
    if (outlet) {
      return res.json({
        id:       outlet.id,
        name:     outlet.name,
        city:     outlet.city,
        tenantId: tid,
        tables:   (outlet.tables || []).map(t => ({
          id:    t.id,
          name:  t.table_number || t.tableNumber || t.name,
          area:  t.workArea || t.area_name || "Main",
          seats: t.seats || 4,
        })),
        gstTreatment: outlet.gstTreatment || "exclusive",
        currency: "₹",
      });
    }
  }

  res.status(404).json({ error: "Outlet not found" });
}));

// ── GET /public/menu ──────────────────────────────────────────────────────────
publicRouter.get("/menu", asyncHandler(async (req, res) => {
  const { outletId, tenantId } = req.query;
  if (!outletId) return res.status(400).json({ error: "outletId required" });

  // Use the same controller functions the authenticated menu routes use
  const { fetchMenuCategories, fetchMenuItems } = require("../menu/menu.service");
  const [categories, items] = await Promise.all([
    fetchMenuCategories(outletId).catch(() => []),
    fetchMenuItems(outletId).catch(() => []),
  ]);

  res.json({
    categories: categories || [],
    items: (items || []).filter(i => i.isActive !== false),
  });
}));

module.exports = { publicRouter };
