/**
 * closed-orders-store.js
 * In-memory store for settled/closed POS orders.
 * Keyed by  tenantId → outletId → [ ...closedOrders ]
 * When ENABLE_DATABASE=true the store is persisted to app_runtime_state
 * so data survives server restarts.
 */

const { isDatabaseEnabled } = require("../../db/database-mode");
const { loadRuntimeState, saveRuntimeState } = require("../../db/runtime-state.repository");
const { insertClosedOrder, updateClosedOrderData, queryCreditOrders, queryCreditSettlementsForRange, findCreditOrderById, getClosedOrderByClosedAt } = require("../../db/closed-orders.repository");

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
 * Writes to in-memory store (instant, used by POS today-only views) AND
 * fire-and-forgets a Postgres INSERT for permanent Owner Web history.
 *
 * @param {string} tenantId
 * @param {string} outletId
 * @param {object} order  — full closedOrder object from POS (already has billNo + closedAt)
 */
function addClosedOrder(tenantId, outletId, order) {
  const stamped = { ...order, _receivedAt: new Date().toISOString() };

  // ── 1. In-memory (today-only POS view) ─────────────────────────────────────
  const list = _getOutletList(tenantId, outletId);
  list.unshift(stamped);
  if (list.length > 1000) list.splice(1000);
  _persist();   // runtime-state JSONB fallback (short-lived)

  // ── 2. Postgres permanent storage (owner history) ───────────────────────────
  insertClosedOrder(tenantId, outletId, stamped).catch((err) =>
    console.error("[closed-orders-store] Postgres write error:", err.message)
  );
}

/**
 * Return all closed orders for a tenant (across all outlets) closed today (IST).
 */
function getTodaySales(tenantId) {
  if (!store.has(tenantId)) return [];
  const todayStr = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  const result = [];
  for (const [outletId, outletOrders] of store.get(tenantId).entries()) {
    for (const order of outletOrders) {
      const closedStr = new Date(order.closedAt || order._receivedAt || 0)
        .toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
      if (closedStr === todayStr) result.push({ ...order, _outletId: outletId });
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
      if (closedStr >= dateFrom && closedStr <= dateTo) result.push({ ...order, _outletId: oid });
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

/**
 * Return credit orders for a tenant. Supports optional filters:
 *   outletId  — restrict to a specific outlet
 *   dateFrom  — ISO date string or YYYY-MM-DD (inclusive, IST)
 *   dateTo    — ISO date string or YYYY-MM-DD (inclusive, IST)
 *
 * When DB is enabled, reads directly from the closed_orders Postgres table so
 * credit bills survive server restarts. Falls back to the in-memory store
 * when DB is disabled (no-DB / local dev mode).
 */
async function getCreditOrders(tenantId, outletId = null, dateFrom = null, dateTo = null) {
  // ── DB path: read from Postgres closed_orders table ───────────────────────
  if (isDatabaseEnabled()) {
    // Normalise dateFrom / dateTo to plain YYYY-MM-DD if they arrive as ISO timestamps
    const from = dateFrom ? dateFrom.slice(0, 10) : null;
    const to   = dateTo   ? dateTo.slice(0, 10)   : null;
    return queryCreditOrders(tenantId, { dateFrom: from, dateTo: to, outletId });
  }

  // ── In-memory fallback (no DB) ─────────────────────────────────────────────
  if (!store.has(tenantId)) return [];
  const tenantMap = store.get(tenantId);
  const keys      = outletId ? [outletId] : [...tenantMap.keys()];
  const result    = [];

  const fromDate = dateFrom ? new Date(dateFrom + (dateFrom.length === 10 ? "T00:00:00+05:30" : "")) : null;
  const toDate   = dateTo   ? new Date(dateTo   + (dateTo.length   === 10 ? "T23:59:59+05:30" : "")) : null;

  for (const oid of keys) {
    const orders = tenantMap.get(oid) || [];
    for (const order of orders) {
      if (!order.isCreditSale) continue;
      if (fromDate || toDate) {
        const closedAt = order.closedAt ? new Date(order.closedAt) : null;
        if (!closedAt) continue;
        if (fromDate && closedAt < fromDate) continue;
        if (toDate   && closedAt > toDate)   continue;
      }
      result.push({ ...order, _outletId: oid });
    }
  }
  // Most recent first
  return result.sort((a, b) => new Date(b.closedAt) - new Date(a.closedAt));
}

/**
 * Settle a credit order — mark creditStatus "paid" and record settlement info.
 * Returns a Promise resolving to the updated order or null if not found.
 *
 * When DB is enabled, falls back to Postgres if the order is no longer in the
 * in-memory store (e.g. after a server restart).
 */
async function settleCreditOrder(tenantId, orderId, settlementInfo) {
  const now = new Date().toISOString();

  // ── Try in-memory store first ──────────────────────────────────────────────
  if (store.has(tenantId)) {
    const tenantMap = store.get(tenantId);
    for (const [outletId, orders] of tenantMap.entries()) {
      // billNo is the only truly unique identifier for a closed order — orderNumber is
      // derived from active-table position/count and gets reused across unrelated bills,
      // so matching on it can silently settle the wrong order when numbers collide.
      // Try billNo across the whole list first; only fall back to the legacy
      // id/orderNumber match (ambiguous when numbers collide) if no billNo matches at all.
      const order =
        orders.find(o => o.isCreditSale && String(o.billNo) === String(orderId)) ||
        orders.find(o => o.isCreditSale && String(o.id || o.orderNumber) === String(orderId));
      if (order) {
        order.creditStatus        = "paid";
        order.creditSettledAt     = now;
        order.creditSettledBy     = settlementInfo.settledBy  || null;
        order.creditSettledMethod = settlementInfo.method     || "cash";
        order.creditSettledRef    = settlementInfo.reference  || null;

        _persist();
        // Must be awaited — getCreditOrders() reads exclusively from Postgres when
        // the DB is enabled, so the in-memory mutation above is invisible to the
        // very next reload unless this write has actually landed first.
        const closedAt = order.closedAt || order._receivedAt;
        if (closedAt) {
          await updateClosedOrderData(tenantId, outletId, closedAt, order).catch(err =>
            console.error("[closed-orders-store] credit settle Postgres sync error:", err.message)
          );
        }
        return order;
      }
    }
  }

  // ── DB fallback: order not in memory (server restarted) ───────────────────
  if (!isDatabaseEnabled()) return null;

  const found = await findCreditOrderById(tenantId, orderId);
  if (!found) return null;

  const { order, outletId } = found;
  order.creditStatus        = "paid";
  order.creditSettledAt     = now;
  order.creditSettledBy     = settlementInfo.settledBy  || null;
  order.creditSettledMethod = settlementInfo.method     || "cash";
  order.creditSettledRef    = settlementInfo.reference  || null;

  // Write back the updated order to Postgres
  const closedAt = order.closedAt || order._receivedAt;
  if (closedAt) {
    await updateClosedOrderData(tenantId, outletId, closedAt, order).catch(err =>
      console.error("[closed-orders-store] DB-fallback settle Postgres sync error:", err.message)
    );
  }

  // Also re-add to in-memory store so subsequent reads in the same session work
  const list = _getOutletList(tenantId, outletId);
  const existing = list.findIndex(o =>
    String(o.billNo) === String(orderId) || String(o.id || o.orderNumber) === String(orderId)
  );
  if (existing >= 0) list[existing] = order;
  else list.unshift(order);

  return order;
}

/**
 * Return closed orders whose credit was SETTLED (creditSettledAt) within a date
 * range (IST). Used by the Reports → Payments tab to surface credit collections
 * on the date they were actually received — independent of when the bill was closed.
 *
 * @param {string}      tenantId
 * @param {string}      dateFrom  — "YYYY-MM-DD" (inclusive)
 * @param {string}      dateTo    — "YYYY-MM-DD" (inclusive)
 * @param {string|null} outletId  — optional outlet filter
 */
function _getCreditSettlementsFromMemory(tenantId, dateFrom, dateTo, outletId = null) {
  if (!store.has(tenantId)) return [];
  const tenantMap = store.get(tenantId);
  const keys      = outletId ? [outletId] : [...tenantMap.keys()];
  const result    = [];

  for (const oid of keys) {
    const orders = tenantMap.get(oid) || [];
    for (const order of orders) {
      if (!order.creditSettledAt) continue;
      const settledStr = new Date(order.creditSettledAt)
        .toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
      if (settledStr >= dateFrom && settledStr <= dateTo) {
        result.push({ ...order, _outletId: oid });
      }
    }
  }
  return result;
}

/**
 * Credit settlements within a date range — merges in-memory (today, not-yet
 * persisted) with Postgres (full history) so settlements survive server
 * restarts, mirroring the pattern used for regular sales history.
 */
async function getCreditSettlementsForRange(tenantId, dateFrom, dateTo, outletId = null) {
  const memResults = _getCreditSettlementsFromMemory(tenantId, dateFrom, dateTo, outletId);
  if (!isDatabaseEnabled()) return memResults;

  const pgResults = await queryCreditSettlementsForRange(tenantId, { dateFrom, dateTo, outletId });

  // Dedup by order.id — in-memory may include orders not yet persisted to Postgres.
  const pgIds = new Set(pgResults.map((o) => o.id).filter(Boolean));
  const newFromMemory = memResults.filter((o) => !o.id || !pgIds.has(o.id));
  return [...newFromMemory, ...pgResults];
}

/**
 * Correct the payment method/split on an already-closed order.
 * Matched by (outletId, closedAt) — both reliably present on the client's
 * copy of a closed order, unlike tableId/orderNumber which get recycled
 * once the table moves on to its next order.
 *
 * @param {string} tenantId
 * @param {string} outletId
 * @param {string} closedAt    — ISO timestamp identifying the closed order
 * @param {Array}  payments    — new payments array [{ method, amount }]
 * @param {string} [correctedBy]
 * @returns {Promise<object|null>} the updated order, or null if not found
 */
async function updateOrderPayments(tenantId, outletId, closedAt, payments, correctedBy = null) {
  const now = new Date().toISOString();

  // ── In-memory store first ──────────────────────────────────────────────────
  const list  = _getOutletList(tenantId, outletId);
  const order = list.find(o => (o.closedAt || o._receivedAt) === closedAt);
  if (order) {
    order.payments           = payments;
    order.paymentCorrectedAt = now;
    order.paymentCorrectedBy = correctedBy;

    _persist();
    await updateClosedOrderData(tenantId, outletId, closedAt, order).catch(err =>
      console.error("[closed-orders-store] payment correction Postgres sync error:", err.message)
    );
    return order;
  }

  // ── DB fallback: order not in memory (server restarted) ───────────────────
  if (!isDatabaseEnabled()) return null;

  const found = await getClosedOrderByClosedAt(tenantId, outletId, closedAt);
  if (!found) return null;

  found.payments           = payments;
  found.paymentCorrectedAt = now;
  found.paymentCorrectedBy = correctedBy;

  await updateClosedOrderData(tenantId, outletId, closedAt, found).catch(err =>
    console.error("[closed-orders-store] DB-fallback payment correction sync error:", err.message)
  );

  list.unshift(found);   // re-add to in-memory so subsequent reads this session work
  return found;
}

module.exports = {
  addClosedOrder,
  getTodaySales, getTodaySalesByOutlet, getSalesForRange,
  hydrateClosedOrders, getOrderById,
  getCreditOrders, settleCreditOrder, getCreditSettlementsForRange,
  updateOrderPayments,
};
