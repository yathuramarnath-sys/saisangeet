const {
  fetchOwnerSummary,
  approveClosing,
  reopenBusinessDay,
  listOrderHistory,
  listKotHistory,
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

/**
 * GET /reports/orders?dateFrom=YYYY-MM-DD&dateTo=YYYY-MM-DD&outletId=&page=1&pageSize=50
 * Paginated closed-order bill list for Owner Web history view.
 */
async function listOrderHistoryHandler(req, res) {
  const tenantId = req.user?.tenantId || "default";
  const { dateFrom, dateTo, outletId } = req.query;
  const page     = Math.max(1, parseInt(req.query.page     || "1",  10));
  const pageSize = Math.min(200, Math.max(1, parseInt(req.query.pageSize || "50", 10)));
  const result   = await listOrderHistory(tenantId, { dateFrom, dateTo, outletId, page, pageSize });
  res.json(result);
}

/**
 * GET /reports/kots?dateFrom=YYYY-MM-DD&dateTo=YYYY-MM-DD&outletId=&page=1&pageSize=50
 * Paginated KOT round list — unnested from closed_orders.order_data.kots[].
 */
async function listKotHistoryHandler(req, res) {
  const tenantId = req.user?.tenantId || "default";
  const { dateFrom, dateTo, outletId } = req.query;
  const page     = Math.max(1, parseInt(req.query.page     || "1",  10));
  const pageSize = Math.min(200, Math.max(1, parseInt(req.query.pageSize || "50", 10)));
  const result   = await listKotHistory(tenantId, { dateFrom, dateTo, outletId, page, pageSize });
  res.json(result);
}

module.exports = {
  ownerSummaryHandler,
  approveClosingHandler,
  reopenBusinessDayHandler,
  listOrderHistoryHandler,
  listKotHistoryHandler,
};
