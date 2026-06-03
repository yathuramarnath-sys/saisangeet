const {
  markCashMismatchUnderReview
} = require("../operations/operations.memory-store");
const { syncOperationsState, persistOperationsState } = require("../operations/operations.state");
const { openShift, recordMovement, closeShift, closeAllShifts, getShifts, deleteShiftFromHistory } = require("../operations/shifts-store");

/** GET /shifts/summary — returns live shift data for Owner Web. */
async function fetchShiftSummary(tenantId) {
  return getShifts(tenantId);
}

/** POST /shifts/open — POS cashier opens a shift. */
async function startShift(tenantId, shift) {
  openShift(tenantId, shift);
  return { ok: true };
}

/** POST /shifts/movement — cash in / cash out recorded by cashier. */
async function addMovement(tenantId, movement) {
  recordMovement(tenantId, movement);
  return { ok: true };
}

/** POST /shifts/close — cashier closes a shift with reconciliation data. */
async function endShift(tenantId, closedShift) {
  closeShift(tenantId, closedShift);
  return { ok: true };
}

/** POST /shifts/close-all — owner force-closes all open shifts (end of day). */
async function endAllShifts(tenantId, closedBy) {
  const closed = closeAllShifts(tenantId, closedBy);
  return { ok: true, closedCount: closed.length, shifts: closed };
}

/** DELETE /shifts/history/:shiftId — owner removes a specific shift entry. */
async function removeShiftFromHistory(tenantId, shiftId) {
  const deleted = deleteShiftFromHistory(tenantId, shiftId);
  return { ok: deleted, shiftId };
}

async function reviewCashMismatch() {
  await syncOperationsState();
  const payload = markCashMismatchUnderReview();
  await persistOperationsState();
  return payload;
}

module.exports = {
  fetchShiftSummary,
  startShift,
  addMovement,
  endShift,
  endAllShifts,
  reviewCashMismatch,
  removeShiftFromHistory
};
