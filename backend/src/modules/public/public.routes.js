/**
 * public.routes.js
 * NO-AUTH public endpoints — used by the customer QR ordering web app.
 *
 * GET /public/outlet?outletId=   — outlet name + table list
 * GET /public/menu?outletId=     — menu categories + items (active only)
 */
const express = require("express");
const { asyncHandler } = require("../../utils/async-handler");
const { getAllCachedTenants } = require("../../data/owner-setup-store");
const { runWithTenant, getCurrentTenantId } = require("../../data/tenant-context");

const publicRouter = express.Router();

/**
 * Find which tenantId owns this outletId by scanning all cached tenants.
 * Returns the tenantId string, or null if not found.
 */
async function resolveTenantForOutlet(outletId, hintTenantId) {
  const { getOwnerSetupData } = require("../../data/owner-setup-store");

  // Build search order: hint first, then all others
  const allTenants = getAllCachedTenants();
  const tids = [];
  if (hintTenantId) tids.push(hintTenantId);
  for (const [tid] of allTenants) {
    if (!tids.includes(tid)) tids.push(tid);
  }
  if (!tids.includes("default")) tids.push("default");

  for (const tid of tids) {
    let found = false;
    await runWithTenant(tid, () => {
      const data = getOwnerSetupData();
      found = (data?.outlets || []).some(o => o.id === outletId && o.isActive !== false);
    });
    if (found) return tid;
  }
  return null;
}

// ── GET /public/outlet ────────────────────────────────────────────────────────
publicRouter.get("/outlet", asyncHandler(async (req, res) => {
  const { outletId, tenantId } = req.query;
  if (!outletId) return res.status(400).json({ error: "outletId required" });

  const { getOwnerSetupData } = require("../../data/owner-setup-store");

  const tid = await resolveTenantForOutlet(outletId, tenantId);
  if (!tid) return res.status(404).json({ error: "Outlet not found" });

  let outlet = null;
  await runWithTenant(tid, () => {
    const data = getOwnerSetupData();
    outlet = (data?.outlets || []).find(o => o.id === outletId && o.isActive !== false);
  });
  if (!outlet) return res.status(404).json({ error: "Outlet not found" });

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
}));

// ── GET /public/menu ──────────────────────────────────────────────────────────
publicRouter.get("/menu", asyncHandler(async (req, res) => {
  const { outletId, tenantId } = req.query;
  if (!outletId) return res.status(400).json({ error: "outletId required" });

  const { fetchMenuCategories, fetchMenuItems } = require("../menu/menu.service");

  const tid = await resolveTenantForOutlet(outletId, tenantId) || tenantId || "default";

  let categories = [], items = [];
  await runWithTenant(tid, async () => {
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

// ── POST /public/bill-request ─────────────────────────────────────────────────
publicRouter.post("/bill-request", asyncHandler(async (req, res) => {
  const { outletId, tableId, tableLabel, tenantId, customerName } = req.body || {};
  if (!outletId || !tableId) return res.status(400).json({ error: "outletId and tableId required" });

  const tid = await resolveTenantForOutlet(outletId, tenantId) || tenantId || "default";
  const io  = req.app.locals.io;
  if (io) {
    io.to(`outlet:${tid}:${outletId}`).emit("bill:requested", {
      tableId,
      tableLabel: tableLabel || tableId,
      isSplit:    false,
      source:     "qr",
      customerName: customerName || "",
    });
  }
  // Also persist via operations bill-request so POS table turns blue
  try {
    const { requestOrderBill } = require("../operations/operations.repository");
    await runWithTenant(tid, () => requestOrderBill(tableId, `${customerName || "Customer"} (QR)`, false));
  } catch (_) { /* non-critical */ }

  res.json({ ok: true });
}));

// ── POST /public/call-waiter ──────────────────────────────────────────────────
publicRouter.post("/call-waiter", asyncHandler(async (req, res) => {
  const { outletId, tableId, tableLabel, tenantId, customerName } = req.body || {};
  if (!outletId || !tableId) return res.status(400).json({ error: "outletId and tableId required" });

  const tid = await resolveTenantForOutlet(outletId, tenantId) || tenantId || "default";
  const io  = req.app.locals.io;
  if (io) {
    io.to(`outlet:${tid}:${outletId}`).emit("waiter:called", {
      tableId,
      tableLabel: tableLabel || tableId,
      customerName: customerName || "",
      calledAt: new Date().toISOString(),
    });
  }
  res.json({ ok: true });
}));

module.exports = { publicRouter };
