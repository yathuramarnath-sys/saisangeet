/**
 * online-orders.repository.js
 * Postgres persistence for online orders — so orders survive backend restarts.
 */

const { query } = require("../../db/pool");

async function ensureOnlineOrdersTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS online_orders (
      id             TEXT PRIMARY KEY,
      tenant_id      TEXT NOT NULL,
      outlet_id      TEXT NOT NULL,
      platform       TEXT NOT NULL DEFAULT 'Online',
      order_id       TEXT,
      customer       JSONB NOT NULL DEFAULT '{}',
      items          JSONB NOT NULL DEFAULT '[]',
      total          NUMERIC(10,2) NOT NULL DEFAULT 0,
      eta_min        INTEGER,
      notes          TEXT NOT NULL DEFAULT '',
      status         TEXT NOT NULL DEFAULT 'pending',
      received_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      accepted_at    TIMESTAMPTZ,
      rejected_at    TIMESTAMPTZ,
      food_ready_at  TIMESTAMPTZ,
      reject_reason  TEXT,
      accepted_by    TEXT
    )
  `);
  await query(`
    CREATE INDEX IF NOT EXISTS idx_oo_tenant_outlet
    ON online_orders (tenant_id, outlet_id, received_at DESC)
  `);
}

async function saveOnlineOrder(tenantId, outletId, order) {
  await query(
    `INSERT INTO online_orders
       (id, tenant_id, outlet_id, platform, order_id, customer, items,
        total, eta_min, notes, status, received_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     ON CONFLICT (id) DO NOTHING`,
    [
      order.id, tenantId, outletId, order.platform,
      order.orderId || order.id,
      JSON.stringify(order.customer),
      JSON.stringify(order.items),
      order.total, order.etaMin ?? null, order.notes || "",
      order.status, order.receivedAt || new Date().toISOString(),
    ]
  );
}

async function updateOnlineOrderInDB(id, updates) {
  const sets = [];
  const vals = [];
  let i = 1;
  if (updates.status       != null) { sets.push(`status = $${i++}`);        vals.push(updates.status); }
  if (updates.acceptedAt   != null) { sets.push(`accepted_at = $${i++}`);   vals.push(updates.acceptedAt); }
  if (updates.rejectedAt   != null) { sets.push(`rejected_at = $${i++}`);   vals.push(updates.rejectedAt); }
  if (updates.foodReadyAt  != null) { sets.push(`food_ready_at = $${i++}`); vals.push(updates.foodReadyAt); }
  if (updates.rejectReason != null) { sets.push(`reject_reason = $${i++}`); vals.push(updates.rejectReason); }
  if (updates.acceptedBy   != null) { sets.push(`accepted_by = $${i++}`);   vals.push(updates.acceptedBy); }
  if (sets.length === 0) return;
  vals.push(id);
  await query(`UPDATE online_orders SET ${sets.join(", ")} WHERE id = $${i}`, vals);
}

/**
 * Load today's orders (last 24 h) for seeding the in-memory store on startup.
 * Returns objects with tenantId + outletId so the store can bucket them correctly.
 */
async function loadTodayOnlineOrders() {
  const rows = await query(
    `SELECT * FROM online_orders
     WHERE received_at > NOW() - INTERVAL '24 hours'
     ORDER BY received_at DESC
     LIMIT 1000`
  );
  return rows.rows.map(r => ({
    // Store keys — used by restoreOnlineOrders(), stripped before inserting into the list
    _tenantId:   r.tenant_id,
    _outletId:   r.outlet_id,
    // Order fields
    id:          r.id,
    platform:    r.platform,
    orderId:     r.order_id,
    customer:    typeof r.customer === "string" ? JSON.parse(r.customer) : r.customer,
    items:       typeof r.items    === "string" ? JSON.parse(r.items)    : r.items,
    total:       Number(r.total),
    etaMin:      r.eta_min,
    notes:       r.notes,
    status:      r.status,
    receivedAt:  r.received_at,
    acceptedAt:  r.accepted_at,
    rejectedAt:  r.rejected_at,
    foodReadyAt: r.food_ready_at,
    rejectReason: r.reject_reason,
    acceptedBy:  r.accepted_by,
  }));
}

module.exports = {
  ensureOnlineOrdersTable,
  saveOnlineOrder,
  updateOnlineOrderInDB,
  loadTodayOnlineOrders,
};
