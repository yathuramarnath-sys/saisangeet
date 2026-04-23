const {
  fetchOperationsSummary,
  createOperationsDemoOrder,
  moveOrderTableAssignment,
  fetchOrders,
  fetchOrderByTable,
  fetchOrCreateOrderByTable,
  clearTableOrderAfterSettle,
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
} = require("./operations.repository");

function resolveActor(actorName, actorRole, otpVerified) {
  if (otpVerified) {
    return actorRole === "Owner" ? "Owner OTP" : "Manager OTP";
  }

  return actorName || actorRole || "System";
}

async function getOperationsSummary() {
  return fetchOperationsSummary();
}

async function createDemoOperationsOrder(payload = {}) {
  return createOperationsDemoOrder(resolveActor(payload.actorName, payload.actorRole));
}

async function moveOrderToTable(tableId, payload = {}) {
  return moveOrderTableAssignment(
    tableId,
    payload.targetTableId,
    resolveActor(payload.actorName, payload.actorRole)
  );
}

async function getOrders() {
  return fetchOrders();
}

async function getOrder(tableId) {
  return fetchOrderByTable(tableId);
}

async function getOrCreateOrderForTable(tableId) {
  return fetchOrCreateOrderByTable(tableId);
}

async function sendOrderKot(tableId, payload = {}) {
  return sendKot(tableId, resolveActor(payload.actorName, payload.actorRole));
}

async function requestBillForOrder(tableId, payload = {}) {
  return requestOrderBill(tableId, resolveActor(payload.actorName, payload.actorRole));
}

async function assignWaiterToOrder(tableId, payload = {}) {
  return assignOrderWaiter(
    tableId,
    payload.waiterName,
    resolveActor(payload.actorName, payload.actorRole)
  );
}

async function addItemToOrder(tableId, payload = {}) {
  return createOrderItem(
    tableId,
    payload,
    resolveActor(payload.actorName, payload.actorRole)
  );
}

async function updateOrderItemDetails(tableId, itemId, payload = {}) {
  return editOrderItem(
    tableId,
    itemId,
    payload,
    resolveActor(payload.actorName, payload.actorRole)
  );
}

async function updateOrderSplit(tableId, payload = {}) {
  return updateSplitBill(tableId, resolveActor(payload.actorName, payload.actorRole));
}

async function addPaymentToOrder(tableId, payload = {}) {
  return createOrderPayment(
    tableId,
    payload,
    resolveActor(payload.actorName, payload.actorRole)
  );
}

async function settleOrderBill(tableId, payload = {}) {
  return settleOrder(tableId, resolveActor(payload.actorName, payload.actorRole));
}

async function approveDiscountOverride(tableId, payload = {}) {
  return approveOrderDiscount(tableId, resolveActor(payload.actorName, payload.actorRole, payload.otpVerified));
}

async function approveVoidRequest(tableId, payload = {}) {
  return approveOrderVoid(tableId, resolveActor(payload.actorName, payload.actorRole, payload.otpVerified));
}

async function changeOrderStatus(tableId, payload = {}) {
  return updateOrderPickupStatus(
    tableId,
    payload.pickupStatus,
    resolveActor(payload.actorName, payload.actorRole)
  );
}

async function getOperationsControlLogs() {
  return fetchOperationsControlLogs();
}

async function recordOrderReprint(tableId, payload = {}) {
  return createOrderReprintLog(
    tableId,
    payload.reason,
    resolveActor(payload.actorName, payload.actorRole)
  );
}

async function requestOrderVoidApproval(tableId, payload = {}) {
  return createOrderVoidRequest(
    tableId,
    payload.reason,
    resolveActor(payload.actorName, payload.actorRole)
  );
}

async function clearTableAfterSettle(tableId) {
  return clearTableOrderAfterSettle(tableId);
}

module.exports = {
  getOperationsSummary,
  createDemoOperationsOrder,
  moveOrderToTable,
  getOrders,
  getOrder,
  getOrCreateOrderForTable,
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
  requestOrderVoidApproval,
  clearTableAfterSettle
};
