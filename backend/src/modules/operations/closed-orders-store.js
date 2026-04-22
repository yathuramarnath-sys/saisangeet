/**
 * closed-orders-store.js
 * In-memory store for settled/closed POS orders.
 * Keyed by  tenantId → outletId → [ ...closedOrders ]
 * Resets on server restart (same pattern as kot-store.js).
 */

/** @type {Map<string, Map<string, Array>>} */
const store = new Map();

function _getOutletList(tenantId, outletId) {
  if (!store.has(tenantId)) store.set(tenantId, new Map());
  const tenant = store.get(tenantId);
  if (!tenant.has(outletId)) tenant.set(outletId, []);
  return tenant.get(outletId);
}

/**
 * Persist a closed order.
 * @param {string} tenantId
 * @param {string} outletId
 * @param {object} order  — full closedOrder object from POS
 */
function addClosedOrder(tenantId, outletId, order) {
  const list = _getOutletList(tenantId, outletId);
  list.unshift({ ...order, _receivedAt: new Date().toISOString() });
  // Keep at most 1 000 orders in memory
  if (list.length > 1000) list.splice(1000);
}

/**
 * Return all closed orders for a tenant (across all outlets) that were
 * closed today (IST date comparison).
 */
function getTodaySales(tenantId) {
  if (!store.has(tenantId)) return [];

  const todayStr = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }); // "YYYY-MM-DD"

  const result = [];
  for (const outletOrders of store.get(tenantId).values()) {
    for (const order of outletOrders) {
      const closedStr = new Date(order.closedAt || order._receivedAt || 0).toLocaleDateString("en-CA", {
        timeZone: "Asia/Kolkata"
      });
      if (closedStr === todayStr) result.push(order);
    }
  }
  return result;
}

/**
 * Return all closed orders for a specific outlet (today).
 */
function getTodaySalesByOutlet(tenantId, outletId) {
  const list = _getOutletList(tenantId, outletId);
  const todayStr = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  return list.filter((order) => {
    const closedStr = new Date(order.closedAt || order._receivedAt || 0).toLocaleDateString("en-CA", {
      timeZone: "Asia/Kolkata"
    });
    return closedStr === todayStr;
  });
}

module.exports = { addClosedOrder, getTodaySales, getTodaySalesByOutlet };
