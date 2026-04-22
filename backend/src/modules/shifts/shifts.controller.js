const {
  fetchShiftSummary,
  startShift,
  addMovement,
  endShift,
  reviewCashMismatch
} = require("./shifts.service");

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
}

async function reviewCashMismatchHandler(_req, res) {
  const result = await reviewCashMismatch();
  res.json(result);
}

module.exports = {
  shiftSummaryHandler,
  openShiftHandler,
  recordMovementHandler,
  closeShiftHandler,
  reviewCashMismatchHandler
};
