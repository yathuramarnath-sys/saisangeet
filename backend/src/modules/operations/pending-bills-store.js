/**
 * pending-bills-store.js — server-side pending-bills registry.
 *
 * Backed by PostgreSQL `pending_bills` table so pending bills survive Railway restarts.
 * In-memory map is the hot path. DB is the durable backing store.
 *
 * Layout: Map(`${tenantId}:${outletId}`) → Map(String(orderNumber) → order)
 */

const _store = new Map(); // `${tenantId}:${outletId}` → Map(orderNumber → order)

let _query = null;

function init(queryFn) {
  _query = queryFn;
}

async function _dbWrite(op) {
  if (!_query) return;
  try { await op(); } catch (err) {
    console.error("[pending-bills-store] DB write error:", err.message);
  }
}

function _key(tenantId, outletId) {
  return `${tenantId}:${outletId}`;
}

function addPendingBill(tenantId, outletId, order) {
  if (!tenantId || !outletId || !order?.orderNumber) return;
  const k = _key(tenantId, outletId);
  if (!_store.has(k)) _store.set(k, new Map());
  const entry = { ...order, _pendingBillAt: new Date().toISOString() };
  _store.get(k).set(String(order.orderNumber), entry);
  _dbWrite(async () => {
    await _query(
      `INSERT INTO pending_bills (order_number, tenant_id, outlet_id, data, created_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (order_number, tenant_id, outlet_id) DO UPDATE SET data = $4`,
      [String(order.orderNumber), tenantId, outletId, JSON.stringify(entry)]
    );
  });
}

function removePendingBill(tenantId, outletId, orderNumber) {
  if (!tenantId || !outletId || orderNumber == null) return;
  _store.get(_key(tenantId, outletId))?.delete(String(orderNumber));
  _dbWrite(async () => {
    await _query(
      "DELETE FROM pending_bills WHERE order_number = $1 AND tenant_id = $2 AND outlet_id = $3",
      [String(orderNumber), tenantId, outletId]
    );
  });
}

function getPendingBills(tenantId, outletId) {
  const m = _store.get(_key(tenantId, outletId));
  if (!m) return [];
  return Array.from(m.values());
}

// ── DB load on startup ────────────────────────────────────────────────────────

async function loadPendingBillsFromDb() {
  if (!_query) return;
  try {
    // Only restore pending bills created today (IST). Bills from yesterday or
    // earlier are stale — the table has already been reset for a new day.
    const result = await _query(
      `SELECT tenant_id, outlet_id, order_number, data FROM pending_bills
       WHERE created_at >= (NOW() AT TIME ZONE 'Asia/Kolkata')::date AT TIME ZONE 'Asia/Kolkata'
       ORDER BY created_at ASC`
    );
    let count = 0;
    for (const row of result.rows) {
      try {
        const order = JSON.parse(row.data);
        const k = _key(row.tenant_id, row.outlet_id);
        if (!_store.has(k)) _store.set(k, new Map());
        _store.get(k).set(row.order_number, order);
        count++;
      } catch (_) {}
    }
    // Also purge old rows from DB so they don't accumulate
    await _query(
      `DELETE FROM pending_bills
       WHERE created_at < (NOW() AT TIME ZONE 'Asia/Kolkata')::date AT TIME ZONE 'Asia/Kolkata'`
    ).catch(() => {});
    if (count > 0) console.log(`[pending-bills-store] restored ${count} pending bills from DB`);
  } catch (err) {
    console.warn("[pending-bills-store] could not load from DB:", err.message);
  }
}

module.exports = { init, addPendingBill, removePendingBill, getPendingBills, loadPendingBillsFromDb };
