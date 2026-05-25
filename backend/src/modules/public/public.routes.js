/**
 * public.routes.js
 * NO-AUTH public endpoints — used by the customer QR ordering web app.
 *
 * GET /public/outlet?outletId=   — outlet name + table list
 * GET /public/menu?outletId=     — menu categories + items (active only)
 */
const express = require("express");
const { asyncHandler } = require("../../utils/async-handler");
const { getOwnerSetupData, getAllCachedTenants } = require("../../data/owner-setup-store");

const publicRouter = express.Router();

// ── GET /public/outlet ────────────────────────────────────────────────────────
publicRouter.get("/outlet", asyncHandler(async (req, res) => {
  const { outletId, tenantId } = req.query;
  if (!outletId) return res.status(400).json({ error: "outletId required" });

  // Build list of tenantIds to search.
  // If tenantId is provided in the QR URL, try it first (fast path).
  // Otherwise search all cached tenants so the QR works even without tid param.
  let tids = [];
  if (tenantId) tids.push(tenantId);
  const allTenants = getAllCachedTenants();
  for (const [tid] of allTenants) {
    if (!tids.includes(tid)) tids.push(tid);
  }
  // Always include "default" as fallback
  if (!tids.includes("default")) tids.push("default");

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

  const { fetchMenuCategories, fetchMenuItems } = require("../menu/menu.service");
  const { runWithTenant } = require("../../data/tenant-context");

  // Resolve correct tenantId — search all tenants if not provided
  let resolvedTenantId = tenantId || null;
  if (!resolvedTenantId) {
    const allTenants = getAllCachedTenants();
    for (const [tid, data] of allTenants) {
      const found = (data?.outlets || []).some(o => o.id === outletId);
      if (found) { resolvedTenantId = tid; break; }
    }
  }
  resolvedTenantId = resolvedTenantId || "default";

  // Run inside tenant context so menu.service reads the correct tenant's data
  let categories = [], items = [];
  await runWithTenant(resolvedTenantId, async () => {
    [categories, items] = await Promise.all([
      fetchMenuCategories(outletId).catch(() => []),
      fetchMenuItems(outletId).catch(() => []),
    ]);
  });

  res.json({
    categories: categories || [],
    items: (items || []).filter(i => i.isActive !== false),
  });
}));

module.exports = { publicRouter };
