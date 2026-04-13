const {
  listOrders,
  getOrder,
  getSummary,
  markKotSent,
  requestBill,
  assignWaiter,
  addOrderItem,
  updateOrderItem,
  approveDiscount,
  approveVoid,
  updateOrderStatus
} = require("./operations.memory-store");

async function fetchOperationsSummary() {
  return getSummary();
}

async function fetchOrders() {
  return listOrders();
}

async function fetchOrderByTable(tableId) {
  return getOrder(tableId);
}

async function sendKot(tableId, actor) {
  return markKotSent(tableId, actor);
}

async function requestOrderBill(tableId, actor) {
  return requestBill(tableId, actor);
}

async function assignOrderWaiter(tableId, waiterName, actor) {
  return assignWaiter(tableId, waiterName, actor);
}

async function createOrderItem(tableId, payload, actor) {
  return addOrderItem(tableId, payload, actor);
}

async function editOrderItem(tableId, itemId, payload, actor) {
  return updateOrderItem(tableId, itemId, payload, actor);
}

async function approveOrderDiscount(tableId, actor) {
  return approveDiscount(tableId, actor);
}

async function approveOrderVoid(tableId, actor) {
  return approveVoid(tableId, actor);
}

async function updateOrderPickupStatus(tableId, pickupStatus, actor) {
  return updateOrderStatus(tableId, pickupStatus, actor);
}

module.exports = {
  fetchOperationsSummary,
  fetchOrders,
  fetchOrderByTable,
  sendKot,
  requestOrderBill,
  assignOrderWaiter,
  createOrderItem,
  editOrderItem,
  approveOrderDiscount,
  approveOrderVoid,
  updateOrderPickupStatus
};
