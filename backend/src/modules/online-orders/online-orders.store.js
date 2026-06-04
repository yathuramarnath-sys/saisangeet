/**
 * online-orders.store.js
 * In-memory store for pending/accepted/rejected online orders per tenant.
 * Orders live here until the POS cashier accepts or rejects them.
 * Accepted orders move to the main operations flow (POS creates KOT).
 */

// Map<tenantId, Map<outletId, OnlineOrder[]>>
const store = new Map();

function _getList(tenantId, outletId) {
  if (!store.has(tenantId)) store.set(tenantId, new Map());
  const tenantMap = store.get(tenantId);
  if (!tenantMap.has(outletId)) tenantMap.set(outletId, []);
  return tenantMap.get(outletId);
}

/**
 * Add a new incoming online order (webhook push).
 * Returns the stored order with server-assigned id.
 */
function addOnlineOrder(tenantId, outletId, raw) {
  const order = {
    id:         raw.id        || `ol-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
    platform:   raw.platform  || "Online",   // "Swiggy" | "Zomato" | "Direct"
    orderId:    raw.orderId   || raw.id,
    customer:   raw.customer  || { name: "Guest", phone: "", address: "" },
    items:      (raw.items    || []).map(i => ({
      name:     i.name,
      price:    Number(i.price) || 0,
      quantity: Number(i.quantity) || 1,
      note:     i.note || ""
    })),
    total:      Number(raw.total) || 0,
    etaMin:     Number(raw.etaMin) || null,
    notes:      raw.notes || "",
    status:     "pending",
    receivedAt: new Date().toISOString(),
  };

  const list = _getList(tenantId, outletId);

  // Idempotency: if this order ID already exists, return the existing entry unchanged.
  // UrbanPiper retries webhooks on network failures — without this check the same
  // Swiggy/Zomato order would appear twice on the POS screen.
  const existing = list.find(o => o.id === order.id || o.orderId === order.orderId);
  if (existing) return existing;

  list.unshift(order);
  // Keep last 200 per outlet (accepted + rejected accumulate over day)
  if (list.length > 200) list.splice(200);

  return order;
}

/**
 * Update order status — "accepted" | "rejected"
 */
function updateOnlineOrderStatus(tenantId, outletId, orderId, status, extra = {}) {
  const list = _getList(tenantId, outletId);
  const idx  = list.findIndex(o => o.id === orderId || o.orderId === orderId);
  if (idx < 0) return null;
  list[idx] = { ...list[idx], status, ...extra };
  return list[idx];
}

/**
 * Get all orders for an outlet (optionally filtered by status).
 */
function getOnlineOrders(tenantId, outletId, status = null) {
  const list = _getList(tenantId, outletId);
  return status ? list.filter(o => o.status === status) : [...list];
}

/**
 * Seed the in-memory store from Postgres rows returned by loadTodayOnlineOrders().
 * Called once on startup from migrate.js after the online_orders table is ready.
 */
function restoreOnlineOrders(dbOrders) {
  for (const row of dbOrders) {
    const { _tenantId, _outletId, ...order } = row;
    if (!_tenantId || !_outletId) continue;
    const list = _getList(_tenantId, _outletId);
    if (!list.find(o => o.id === order.id)) {
      list.push(order);
    }
  }
  console.log(`[online-orders] restored ${dbOrders.length} orders from DB`);
}

module.exports = { addOnlineOrder, updateOnlineOrderStatus, getOnlineOrders, restoreOnlineOrders };
