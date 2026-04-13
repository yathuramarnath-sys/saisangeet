const {
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

async function getOrders() {
  return fetchOrders();
}

async function getOrder(tableId) {
  return fetchOrderByTable(tableId);
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

module.exports = {
  getOperationsSummary,
  getOrders,
  getOrder,
  sendOrderKot,
  requestBillForOrder,
  assignWaiterToOrder,
  addItemToOrder,
  updateOrderItemDetails,
  approveDiscountOverride,
  approveVoidRequest,
  changeOrderStatus
};
