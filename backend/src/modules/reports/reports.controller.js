const {
  fetchOwnerSummary,
  approveClosing,
  reopenBusinessDay
} = require("./reports.service");

async function ownerSummaryHandler(req, res) {
  const tenantId = req.user?.tenantId || "default";
  const { dateFrom, dateTo, outletId } = req.query;
  const result = await fetchOwnerSummary(tenantId, { dateFrom, dateTo, outletId });
  res.json(result);
}

async function approveClosingHandler(req, res) {
  const tenantId = req.user?.tenantId || "default";
  const result = await approveClosing(req.body, tenantId);
  res.json(result);
}

async function reopenBusinessDayHandler(req, res) {
  const tenantId = req.user?.tenantId || "default";
  const result = await reopenBusinessDay(req.body, tenantId);
  res.json(result);
}

module.exports = {
  ownerSummaryHandler,
  approveClosingHandler,
  reopenBusinessDayHandler
};
