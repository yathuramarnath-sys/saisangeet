/**
 * settlements.routes.js
 *
 * Store/retrieve online platform settlement records per tenant.
 * Each settlement represents one payout cycle from Swiggy or Zomato.
 *
 * Endpoints (all private — require JWT):
 *   GET    /settlements          — list all settlements (newest first)
 *   POST   /settlements          — add a new settlement record
 *   DELETE /settlements/:id      — delete a settlement record
 *
 * Data shape (stored in ownerSetupData.settlements[]):
 * {
 *   id, platform, periodFrom, periodTo, settlementDate, bankUTR, orders,
 *   itemTotal, packagingCharges, discountShare, gstCollected, totalCustomerPaid,
 *   commission, commissionPct, gstOnPlatformFees, paymentCharges, otherPlatformFees,
 *   customerComplaints, adsDeductions, gstDeduction, tds, tcs, netPayout,
 *   notes, createdAt
 * }
 */

const express          = require("express");
const { requireAuth }  = require("../../middleware/require-auth");
const { asyncHandler } = require("../../utils/async-handler");
const { runWithTenant } = require("../../data/tenant-context");
const {
  getOwnerSetupData,
  updateOwnerSetupData,
} = require("../../data/owner-setup-store");

const settlementsRouter = express.Router();

// ─────────────────────────────────────────────────────────────────────────────
// GET /settlements — list all settlements, newest first
// ─────────────────────────────────────────────────────────────────────────────
settlementsRouter.get(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const tenantId = req.user?.tenantId || "default";
    const data     = await runWithTenant(tenantId, () => getOwnerSetupData());
    const list     = (data?.settlements || []).sort(
      (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
    );
    res.json(list);
  })
);

// ─────────────────────────────────────────────────────────────────────────────
// POST /settlements — create a new settlement record
// ─────────────────────────────────────────────────────────────────────────────
settlementsRouter.post(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const tenantId = req.user?.tenantId || "default";
    const body     = req.body || {};

    const n = (v) => Number(v) || 0;

    const record = {
      id:                 `stl_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      platform:           body.platform       || "swiggy",        // 'swiggy' | 'zomato'
      periodFrom:         body.periodFrom     || "",
      periodTo:           body.periodTo       || "",
      settlementDate:     body.settlementDate || "",
      bankUTR:            body.bankUTR        || "",
      orders:             n(body.orders),

      // Revenue (what customer paid)
      itemTotal:          n(body.itemTotal),
      packagingCharges:   n(body.packagingCharges),
      discountShare:      n(body.discountShare),   // restaurant's share of promo discount
      gstCollected:       n(body.gstCollected),    // GST collected from customer (passthrough)
      totalCustomerPaid:  n(body.totalCustomerPaid),

      // Platform Fees (expenses deducted from gross)
      commission:         n(body.commission),
      commissionPct:      n(body.commissionPct),
      gstOnPlatformFees:  n(body.gstOnPlatformFees),  // GST @18% on commission+fees
      paymentCharges:     n(body.paymentCharges),      // payment gateway fee
      otherPlatformFees:  n(body.otherPlatformFees),   // long distance, bolt, etc.

      // Other Deductions
      customerComplaints: n(body.customerComplaints),  // refunds to customers
      adsDeductions:      n(body.adsDeductions),        // ad spend, marketing

      // Government / Tax
      gstDeduction:       n(body.gstDeduction),   // GST paid by platform on behalf (sec 9(5))
      tds:                n(body.tds),             // TDS 194-O
      tcs:                n(body.tcs),             // TCS (usually 0)

      // Final
      netPayout:          n(body.netPayout),
      notes:              body.notes || "",
      createdAt:          new Date().toISOString(),
    };

    await runWithTenant(tenantId, () =>
      updateOwnerSetupData(d => ({
        ...d,
        settlements: [...(d.settlements || []), record],
      }))
    );

    console.log(`[settlements] added | tenant=${tenantId} | platform=${record.platform} | net=₹${record.netPayout}`);
    res.json(record);
  })
);

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /settlements/:id — remove a settlement record
// ─────────────────────────────────────────────────────────────────────────────
settlementsRouter.delete(
  "/:id",
  requireAuth,
  asyncHandler(async (req, res) => {
    const tenantId = req.user?.tenantId || "default";
    const { id }   = req.params;

    await runWithTenant(tenantId, () =>
      updateOwnerSetupData(d => ({
        ...d,
        settlements: (d.settlements || []).filter(s => s.id !== id),
      }))
    );

    res.json({ ok: true });
  })
);

module.exports = { settlementsRouter };
