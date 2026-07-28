/**
 * pending-bills-store.js — server-side pending-bills registry.
 *
 * When the captain's auto-advance fires (a table has billRequested + hasNextOrder),
 * the displaced order is saved here so ALL POS terminals — not just the one that
 * happened to be open — can show it in the Pending Bills section.
 *
 * Layout: Map(`${tenantId}:${outletId}`) → Map(String(orderNumber) → order)
 * Memory only; a server restart clears the list. Any order still in a pending
 * state after restart will re-appear here the next time the captain opens that
 * table and auto-advance fires again.
 */

const _store = new Map(); // `${tenantId}:${outletId}` → Map(orderNumber → order)

function _key(tenantId, outletId) {
  return `${tenantId}:${outletId}`;
}

function addPendingBill(tenantId, outletId, order) {
  if (!tenantId || !outletId || !order?.orderNumber) return;
  const k = _key(tenantId, outletId);
  if (!_store.has(k)) _store.set(k, new Map());
  _store.get(k).set(String(order.orderNumber), {
    ...order,
    _pendingBillAt: new Date().toISOString(),
  });
}

function removePendingBill(tenantId, outletId, orderNumber) {
  if (!tenantId || !outletId || orderNumber == null) return;
  _store.get(_key(tenantId, outletId))?.delete(String(orderNumber));
}

function getPendingBills(tenantId, outletId) {
  const m = _store.get(_key(tenantId, outletId));
  if (!m) return [];
  return Array.from(m.values());
}

module.exports = { addPendingBill, removePendingBill, getPendingBills };
