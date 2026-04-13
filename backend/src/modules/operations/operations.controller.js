const {
  getOperationsSummary,
  createDemoOperationsOrder,
  moveOrderToTable,
  getOrders,
  getOrder,
  sendOrderKot,
  requestBillForOrder,
  assignWaiterToOrder,
  addItemToOrder,
  updateOrderItemDetails,
  updateOrderSplit,
  addPaymentToOrder,
  settleOrderBill,
  approveDiscountOverride,
  approveVoidRequest,
  changeOrderStatus,
  getOperationsControlLogs,
  recordOrderReprint,
  requestOrderVoidApproval
} = require("./operations.service");

async function listOperationsSummaryHandler(_req, res) {
  const result = await getOperationsSummary();
  res.json(result);
}

async function createDemoOrderHandler(req, res) {
  const result = await createDemoOperationsOrder(req.body);
  res.status(201).json(result);
}

async function listOrdersHandler(_req, res) {
  const result = await getOrders();
  res.json(result);
}

async function getOrderHandler(req, res) {
  const result = await getOrder(req.params.tableId);
  res.json(result);
}

async function sendKotHandler(req, res) {
  const result = await sendOrderKot(req.params.tableId, req.body);
  res.json(result);
}

async function requestBillHandler(req, res) {
  const result = await requestBillForOrder(req.params.tableId, req.body);
  res.json(result);
}

async function moveTableHandler(req, res) {
  const result = await moveOrderToTable(req.params.tableId, req.body);
  res.json(result);
}

async function assignWaiterHandler(req, res) {
  const result = await assignWaiterToOrder(req.params.tableId, req.body);
  res.json(result);
}

async function addOrderItemHandler(req, res) {
  const result = await addItemToOrder(req.params.tableId, req.body);
  res.status(201).json(result);
}

async function updateOrderItemHandler(req, res) {
  const result = await updateOrderItemDetails(req.params.tableId, req.params.itemId, req.body);
  res.json(result);
}

async function splitBillHandler(req, res) {
  const result = await updateOrderSplit(req.params.tableId, req.body);
  res.json(result);
}

async function addPaymentHandler(req, res) {
  const result = await addPaymentToOrder(req.params.tableId, req.body);
  res.status(201).json(result);
}

async function closeOrderHandler(req, res) {
  const result = await settleOrderBill(req.params.tableId, req.body);
  res.json(result);
}

async function approveDiscountHandler(req, res) {
  const result = await approveDiscountOverride(req.params.tableId, req.body);
  res.json(result);
}

async function approveVoidHandler(req, res) {
  const result = await approveVoidRequest(req.params.tableId, req.body);
  res.json(result);
}

async function updateOrderStatusHandler(req, res) {
  const result = await changeOrderStatus(req.params.tableId, req.body);
  res.json(result);
}

async function listControlLogsHandler(_req, res) {
  const result = await getOperationsControlLogs();
  res.json(result);
}

async function recordReprintHandler(req, res) {
  const result = await recordOrderReprint(req.params.tableId, req.body);
  res.status(201).json(result);
}

async function requestVoidApprovalHandler(req, res) {
  const result = await requestOrderVoidApproval(req.params.tableId, req.body);
  res.json(result);
}

module.exports = {
  listOperationsSummaryHandler,
  createDemoOrderHandler,
  listOrdersHandler,
  getOrderHandler,
  sendKotHandler,
  requestBillHandler,
  moveTableHandler,
  assignWaiterHandler,
  addOrderItemHandler,
  updateOrderItemHandler,
  splitBillHandler,
  addPaymentHandler,
  closeOrderHandler,
  approveDiscountHandler,
  approveVoidHandler,
  updateOrderStatusHandler,
  listControlLogsHandler,
  recordReprintHandler,
  requestVoidApprovalHandler
};
