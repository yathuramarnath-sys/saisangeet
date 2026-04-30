/**
 * closed-orders-store.js
 * In-memory store for settled/closed POS orders.
 * Keyed by  tenantId → outletId → [ ...closedOrders ]
 * When ENABLE_DATABASE=true the store is persisted to app_runtime_state
 * so data survives server restarts.
 */

const { isDatabaseEnabled } = require("../../db/database-mode");
const { loadRuntimeState, saveRuntimeState } = require("../../db/runtime-state.repository");

const SCOPE = "closed-orders";

/** @type {Map<string, Map<string, Array>>} */
const store = new Map();
let _loaded = false;

function _getOutletList(tenantId, outletId) {
  if (!store.has(tenantId)) store.set(tenantId, new Map());
  const tenant = store.get(tenantId);
  if (!tenant.has(outletId)) tenant.set(outletId, []);
  return tenant.get(outletId);
}

/** Serialise Map structure → plain object for Postgres JSONB */
function _toPlain() {
  const out = {};
  for (const [tid, outletMap] of store.entries()) {
    out[tid] = {};
    for (const [oid, orders] of outletMap.entries()) {
      out[tid][oid] = orders;
    }
  }
  return out;
}

/** Restore plain object → Map structure */
function _fromPlain(plain) {
  for (const [tid, outletObj] of Object.entries(plain || {})) {
    if (!store.has(tid)) store.set(tid, new Map());
    const outletMap = store.get(tid);
    for (const [oid, orders] of Object.entries(outletObj || {})) {
      outletMap.set(oid, Array.isArray(orders) ? orders : []);
    }
  }
}

/** Save current store state to Postgres (fire-and-forget). */
function _persist() {
  if (!isDatabaseEnabled()) return;
  saveRuntimeState(SCOPE, _toPlain()).catch(err =>
    console.error("[closed-orders-store] persist error:", err.message)
  );
}

/** Load from Postgres once on first use. */
async function _ensureLoaded() {
  if (_loaded || !isDatabaseEnabled()) { _loaded = true; return; }
  _loaded = true;
  try {
    const saved = await loadRuntimeState(SCOPE);
    if (saved) _fromPlain(saved);
  } catch (err) {
    console.error("[closed-orders-store] load error:", err.message);
  }
}

/** Call once at server startup to preload closed-orders from DB. */
async function hydrateClosedOrders() {
  _loaded = false;
  await _ensureLoaded();
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
  if (list.length > 1000) list.splice(1000);
  _persist();
}

/**
 * Return all closed orders for a tenant (across all outlets) closed today (IST).
 */
function getTodaySales(tenantId) {
  if (!store.has(tenantId)) return [];
  const todayStr = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  const result = [];
  for (const outletOrders of store.get(tenantId).values()) {
    for (const order of outletOrders) {
      const closedStr = new Date(order.closedAt || order._receivedAt || 0)
        .toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
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
    const closedStr = new Date(order.closedAt || order._receivedAt || 0)
      .toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
    return closedStr === todayStr;
  });
}

/**
 * Return closed orders for a tenant within a date range (IST), optionally
 * filtered by outletId.
 * @param {string}      tenantId
 * @param {string}      dateFrom  — "YYYY-MM-DD" (inclusive)
 * @param {string}      dateTo    — "YYYY-MM-DD" (inclusive)
 * @param {string|null} outletId  — if provided, only return orders for this outlet
 */
function getSalesForRange(tenantId, dateFrom, dateTo, outletId) {
  if (!store.has(tenantId)) return [];
  const tenantMap = store.get(tenantId);
  const keys      = outletId ? [outletId] : [...tenantMap.keys()];
  const result    = [];

  for (const oid of keys) {
    const orders = tenantMap.get(oid) || [];
    for (const order of orders) {
      const closedStr = new Date(order.closedAt || order._receivedAt || 0)
        .toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
      if (closedStr >= dateFrom && closedStr <= dateTo) result.push(order);
    }
  }
  return result;
}

/**
 * Find a single closed order by ID for a tenant.
 * Searches today's in-memory orders (and full store if not found today).
 * @param {string}      tenantId
 * @param {string}      orderId
 * @param {string|null} outletId  — optional, narrows search
 */
function getOrderById(tenantId, orderId, outletId = null) {
  if (!store.has(tenantId)) return null;
  const tenantMap = store.get(tenantId);
  const keys = outletId ? [outletId] : [...tenantMap.keys()];
  for (const oid of keys) {
    const orders = tenantMap.get(oid) || [];
    const found = orders.find((o) => o.id === orderId);
    if (found) return found;
  }
  return null;
}

module.exports = { addClosedOrder, getTodaySales, getTodaySalesByOutlet, getSalesForRange, hydrateClosedOrders, getOrderById };
