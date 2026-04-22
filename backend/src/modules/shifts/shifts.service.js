const {
  markCashMismatchUnderReview
} = require("../operations/operations.memory-store");
const { syncOperationsState, persistOperationsState } = require("../operations/operations.state");
const { openShift, recordMovement, closeShift, getShifts } = require("../operations/shifts-store");

/** GET /shifts/summary — returns live shift data for Owner Web. */
async function fetchShiftSummary(tenantId) {
  return getShifts(tenantId || "default");
}

/** POST /shifts/open — POS cashier opens a shift. */
async function startShift(tenantId, shift) {
  openShift(tenantId || "default", shift);
  return { ok: true };
}

/** POST /shifts/movement — cash in / cash out recorded by cashier. */
async function addMovement(tenantId, movement) {
  recordMovement(tenantId || "default", movement);
  return { ok: true };
}

/** POST /shifts/close — cashier closes a shift with reconciliation data. */
async function endShift(tenantId, closedShift) {
  closeShift(tenantId || "default", closedShift);
  return { ok: true };
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
  reviewCashMismatch
};
