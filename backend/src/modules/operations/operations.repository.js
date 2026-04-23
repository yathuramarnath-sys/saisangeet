const {
  listOrders,
  getOrder,
  getOrCreateOrder,
  getSummary,
  createDemoOrder,
  moveTable,
  markKotSent,
  requestBill,
  assignWaiter,
  addOrderItem,
  updateOrderItem,
  splitOrderBill,
  addOrderPayment,
  closeOrder,
  approveDiscount,
  approveVoid,
  updateOrderStatus,
  recordReprint,
  requestVoidApproval,
  getControlLogs
} = require("./operations.memory-store");
const { syncOperationsState, persistOperationsState } = require("./operations.state");

async function runRead(operation) {
  await syncOperationsState();
  return operation();
}

async function runWrite(operation) {
  await syncOperationsState();
  const result = operation();
  await persistOperationsState();
  return result;
}

async function fetchOperationsSummary() {
  return runRead(() => getSummary());
}

async function createOperationsDemoOrder(actor) {
  return runWrite(() => createDemoOrder(actor));
}

async function moveOrderTableAssignment(sourceTableId, targetTableId, actor) {
  return runWrite(() => moveTable(sourceTableId, targetTableId, actor));
}

async function fetchOrders() {
  return runRead(() => listOrders());
}

async function fetchOrderByTable(tableId) {
  return runRead(() => getOrder(tableId));
}

// Device-facing: returns the order if it exists, or creates and persists an empty one for the
// table. Uses runWrite so the new empty order is immediately persisted to Postgres.
// Throws TABLE_NOT_FOUND (404) if the tableId is not in the outlet table catalog.
async function fetchOrCreateOrderByTable(tableId) {
  return runWrite(() => getOrCreateOrder(tableId));
}

async function sendKot(tableId, actor) {
  return runWrite(() => markKotSent(tableId, actor));
}

async function requestOrderBill(tableId, actor) {
  return runWrite(() => requestBill(tableId, actor));
}

async function assignOrderWaiter(tableId, waiterName, actor) {
  return runWrite(() => assignWaiter(tableId, waiterName, actor));
}

async function createOrderItem(tableId, payload, actor) {
  return runWrite(() => addOrderItem(tableId, payload, actor));
}

async function editOrderItem(tableId, itemId, payload, actor) {
  return runWrite(() => updateOrderItem(tableId, itemId, payload, actor));
}

async function updateSplitBill(tableId, actor) {
  return runWrite(() => splitOrderBill(tableId, actor));
}

async function createOrderPayment(tableId, payload, actor) {
  return runWrite(() => addOrderPayment(tableId, payload, actor));
}

async function settleOrder(tableId, actor) {
  return runWrite(() => closeOrder(tableId, actor));
}

async function approveOrderDiscount(tableId, actor) {
  return runWrite(() => approveDiscount(tableId, actor));
}

async function approveOrderVoid(tableId, actor) {
  return runWrite(() => approveVoid(tableId, actor));
}

async function updateOrderPickupStatus(tableId, pickupStatus, actor) {
  return runWrite(() => updateOrderStatus(tableId, pickupStatus, actor));
}

async function fetchOperationsControlLogs() {
  return runRead(() => getControlLogs());
}

async function createOrderReprintLog(tableId, reason, actor) {
  return runWrite(() => recordReprint(tableId, reason, actor));
}

async function createOrderVoidRequest(tableId, reason, actor) {
  return runWrite(() => requestVoidApproval(tableId, reason, actor));
}

module.exports = {
  fetchOperationsSummary,
  createOperationsDemoOrder,
  moveOrderTableAssignment,
  fetchOrders,
  fetchOrderByTable,
  fetchOrCreateOrderByTable,
  sendKot,
  requestOrderBill,
  assignOrderWaiter,
  createOrderItem,
  editOrderItem,
  updateSplitBill,
  createOrderPayment,
  settleOrder,
  approveOrderDiscount,
  approveOrderVoid,
  updateOrderPickupStatus,
  fetchOperationsControlLogs,
  createOrderReprintLog,
  createOrderVoidRequest
};
