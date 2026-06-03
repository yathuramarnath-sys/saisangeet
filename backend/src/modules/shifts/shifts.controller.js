const {
  fetchShiftSummary,
  startShift,
  addMovement,
  endShift,
  endAllShifts,
  reviewCashMismatch,
  removeShiftFromHistory
} = require("./shifts.service");

const { sendShiftCloseSms }  = require("../../utils/sms");
const { getOwnerSetupData }  = require("../../data/owner-setup-store");
const { getTodaySales }      = require("../operations/closed-orders-store");

async function shiftSummaryHandler(req, res) {
  const tenantId = req.user?.tenantId || "default";
  const result = await fetchShiftSummary(tenantId);
  res.json(result);
}

async function openShiftHandler(req, res) {
  const tenantId = req.user?.tenantId || "default";
  const { shift } = req.body;
  if (!shift) return res.status(400).json({ error: "shift is required" });
  const result = await startShift(tenantId, shift);
  // Broadcast to owner dashboard
  const io = req.app.locals.io;
  if (io) io.to(`tenant:${tenantId}`).emit("shift:updated", { type: "open", shift });
  res.json(result);
}

async function recordMovementHandler(req, res) {
  const tenantId = req.user?.tenantId || "default";
  const { movement } = req.body;
  if (!movement) return res.status(400).json({ error: "movement is required" });
  const result = await addMovement(tenantId, movement);
  const io = req.app.locals.io;
  if (io) io.to(`tenant:${tenantId}`).emit("shift:updated", { type: "movement", movement });
  res.json(result);
}

async function closeShiftHandler(req, res) {
  const tenantId = req.user?.tenantId || "default";
  const { shift } = req.body;
  if (!shift) return res.status(400).json({ error: "shift is required" });
  const result = await endShift(tenantId, shift);
  const io = req.app.locals.io;
  if (io) io.to(`tenant:${tenantId}`).emit("shift:updated", { type: "close", shift });
  res.json(result);

  // ── Send SMS sales summary to outlet's registered phone (fire-and-forget) ──
  try {
    const data        = getOwnerSetupData();
    const outletId    = shift?.outletId || null;

    // Get phone from outlet record first, fall back to business profile
    const outlet      = outletId
      ? (data.outlets || []).find(o => String(o.id) === String(outletId))
      : (data.outlets || [])[0];
    const phone       = outlet?.phone || data.businessProfile?.phone || "";
    const outletName  = outlet?.name  || data.businessProfile?.tradeName || "Restaurant";

    // Get today's closed orders for this shift's outlet
    const todaySales  = getTodaySales(tenantId);
    const orders      = outletId
      ? (todaySales || []).filter(o => String(o._outletId || o.outletId) === String(outletId))
      : (todaySales || []);

    if (phone) {
      sendShiftCloseSms({ shift, outletName, phone, closedOrders: orders })
        .catch(err => console.warn("[sms] Shift close SMS failed:", err.message));
    }
  } catch (err) {
    console.warn("[sms] Could not send shift close SMS:", err.message);
  }
}

async function closeAllShiftsHandler(req, res) {
  const tenantId = req.user?.tenantId || "default";
  const closedBy = req.user?.fullName || "Owner";
  const result = await endAllShifts(tenantId, closedBy);
  const io = req.app.locals.io;
  if (io) io.to(`tenant:${tenantId}`).emit("shift:updated", { type: "close-all", count: result.closedCount });
  res.json(result);
}

async function reviewCashMismatchHandler(_req, res) {
  const result = await reviewCashMismatch();
  res.json(result);
}

async function deleteShiftHistoryHandler(req, res) {
  const tenantId = req.user?.tenantId || "default";
  const { shiftId } = req.params;
  if (!shiftId) return res.status(400).json({ error: "shiftId is required" });
  const result = await removeShiftFromHistory(tenantId, shiftId);
  if (!result.ok) return res.status(404).json({ error: "Shift not found" });
  const io = req.app.locals.io;
  if (io) io.to(`tenant:${tenantId}`).emit("shift:updated", { type: "deleted", shiftId });
  res.json(result);
}

module.exports = {
  shiftSummaryHandler,
  openShiftHandler,
  recordMovementHandler,
  closeShiftHandler,
  closeAllShiftsHandler,
  reviewCashMismatchHandler,
  deleteShiftHistoryHandler
};
