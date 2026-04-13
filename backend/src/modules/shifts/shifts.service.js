const {
  getCashShifts,
  markCashMismatchUnderReview
} = require("../operations/operations.memory-store");
const { syncOperationsState, persistOperationsState } = require("../operations/operations.state");

async function fetchShiftSummary() {
  await syncOperationsState();
  return getCashShifts();
}

async function reviewCashMismatch() {
  await syncOperationsState();
  const payload = markCashMismatchUnderReview();
  await persistOperationsState();
  return payload;
}

module.exports = {
  fetchShiftSummary,
  reviewCashMismatch
};
