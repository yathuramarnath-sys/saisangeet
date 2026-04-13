const {
  fetchOwnerSummary,
  approveClosing,
  reopenBusinessDay
} = require("./reports.service");

async function ownerSummaryHandler(_req, res) {
  const result = await fetchOwnerSummary();
  res.json(result);
}

async function approveClosingHandler(req, res) {
  const result = await approveClosing(req.body);
  res.json(result);
}

async function reopenBusinessDayHandler(req, res) {
  const result = await reopenBusinessDay(req.body);
  res.json(result);
}

module.exports = {
  ownerSummaryHandler,
  approveClosingHandler,
  reopenBusinessDayHandler
};
