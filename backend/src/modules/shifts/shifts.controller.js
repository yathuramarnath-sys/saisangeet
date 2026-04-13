const { fetchShiftSummary, reviewCashMismatch } = require("./shifts.service");

async function shiftSummaryHandler(_req, res) {
  const result = await fetchShiftSummary();
  res.json(result);
}

async function reviewCashMismatchHandler(_req, res) {
  const result = await reviewCashMismatch();
  res.json(result);
}

module.exports = {
  shiftSummaryHandler,
  reviewCashMismatchHandler
};
