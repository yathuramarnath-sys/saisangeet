/**
 * closed-orders.repository.js
 * Postgres layer for permanent closed-order storage.
 *
 * Table: closed_orders
 *   pk          BIGSERIAL  — internal row id
 *   tenant_id   TEXT       — multi-tenant isolation
 *   outlet_id   TEXT       — which outlet
 *   bill_no     TEXT       — human-readable bill number (e.g. "42" or "FY25-0042")
 *   closed_date TEXT       — "YYYY-MM-DD" IST, for fast date-range queries
 *   closed_at   TIMESTAMPTZ— exact ISO timestamp of bill closure
 *   order_data  JSONB      — full order object as sent by POS
 *   received_at TIMESTAMPTZ— when backend received it (DEFAULT NOW())
 *
 * Design notes:
 *  - UNIQUE (tenant_id, outlet_id, closed_at) prevents duplicate inserts.
 *  - closed_date column lets date-range queries use a plain index scan (no
 *    timezone conversion in the WHERE clause needed at query time).
 *  - order_data stores the complete order snapshot — no normalisation needed
 *    for this reporting use-case.
 */

const { query }            = require("./pool");
const { isDatabaseEnabled } = require("./database-mode");

// ── Table bootstrap ────────────────────────────────────────────────────────────

async function ensureClosedOrdersTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS closed_orders (
      pk          BIGSERIAL   PRIMARY KEY,
      tenant_id   TEXT        NOT NULL,
      outlet_id   TEXT        NOT NULL,
      bill_no     TEXT,
      closed_date TEXT        NOT NULL,
      closed_at   TIMESTAMPTZ,
      order_data  JSONB       NOT NULL,
      received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (tenant_id, outlet_id, closed_at)
    )
  `);
  // Composite index for the most common query pattern: tenant + date range
  await query(`
    CREATE INDEX IF NOT EXISTS idx_co_tenant_date
      ON closed_orders (tenant_id, closed_date)
  `);
  // Additional index for outlet-scoped queries
  await query(`
    CREATE INDEX IF NOT EXISTS idx_co_outlet_date
      ON closed_orders (tenant_id, outlet_id, closed_date)
  `);
}

// ── Write ──────────────────────────────────────────────────────────────────────

/**
 * Insert one closed order into Postgres.
 * Silent no-op when DB is disabled (JSON-only mode).
 * Uses ON CONFLICT DO NOTHING — idempotent for duplicate sends.
 *
 * @param {string} tenantId
 * @param {string} outletId
 * @param {object} order   — full closed-order payload (already has billNo + closedAt)
 */
async function insertClosedOrder(tenantId, outletId, order) {
  if (!isDatabaseEnabled()) return;

  // Derive IST date string ("YYYY-MM-DD") from closedAt for the indexed column
  const closedAt   = order.closedAt || new Date().toISOString();
  const closedDate = new Date(closedAt)
    .toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }); // "YYYY-MM-DD"

  try {
    await query(
      `INSERT INTO closed_orders
         (tenant_id, outlet_id, bill_no, closed_date, closed_at, order_data)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (tenant_id, outlet_id, closed_at) DO NOTHING`,
      [
        tenantId,
        outletId,
        order.billNo  || null,
        closedDate,
        closedAt,
        JSON.stringify(order),
      ]
    );
  } catch (err) {
    // Log and swallow — the order is already in memory; Postgres is best-effort
    console.error("[closed-orders.repo] INSERT error:", err.message);
  }
}

// ── Read ───────────────────────────────────────────────────────────────────────

/**
 * Query closed orders from Postgres for a date range.
 *
 * @param {string}      tenantId
 * @param {object}      opts
 * @param {string}      opts.dateFrom   "YYYY-MM-DD" (inclusive) — defaults to today
 * @param {string}      opts.dateTo     "YYYY-MM-DD" (inclusive) — defaults to today
 * @param {string|null} opts.outletId   filter to one outlet, or null for all
 * @param {number}      opts.limit      max rows returned (default 1000)
 * @returns {Promise<object[]>}  array of order objects (parsed from JSONB)
 */
async function queryClosedOrders(tenantId, { dateFrom, dateTo, outletId, limit = 1000 } = {}) {
  if (!isDatabaseEnabled()) return [];

  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  const from  = dateFrom || today;
  const to    = dateTo   || today;

  const params = [tenantId, from, to];
  let extra    = "";

  if (outletId) {
    params.push(outletId);
    extra = ` AND outlet_id = $${params.length}`;
  }

  params.push(limit);

  try {
    const r = await query(
      `SELECT order_data
         FROM closed_orders
        WHERE tenant_id   = $1
          AND closed_date >= $2
          AND closed_date <= $3
          ${extra}
        ORDER BY closed_at DESC
        LIMIT $${params.length}`,
      params
    );
    return r.rows.map((row) =>
      typeof row.order_data === "string" ? JSON.parse(row.order_data) : row.order_data
    );
  } catch (err) {
    console.error("[closed-orders.repo] SELECT error:", err.message);
    return [];
  }
}

/**
 * Paginated bill list for Owner Web "Order History" view.
 * Returns { orders, total, page, pageSize } suitable for a table UI.
 *
 * @param {string}  tenantId
 * @param {object}  opts
 * @param {string}  opts.dateFrom
 * @param {string}  opts.dateTo
 * @param {string}  opts.outletId
 * @param {number}  opts.page       1-based, default 1
 * @param {number}  opts.pageSize   default 50
 */
async function listClosedOrders(tenantId, { dateFrom, dateTo, outletId, page = 1, pageSize = 50 } = {}) {
  if (!isDatabaseEnabled()) return { orders: [], total: 0, page, pageSize };

  const today  = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  const from   = dateFrom || today;
  const to     = dateTo   || today;
  const offset = (page - 1) * pageSize;

  const params = [tenantId, from, to];
  let extra    = "";

  if (outletId) {
    params.push(outletId);
    extra = ` AND outlet_id = $${params.length}`;
  }

  try {
    // COUNT query (re-uses same params)
    const countParams = [...params];
    const countResult = await query(
      `SELECT COUNT(*)::int AS total
         FROM closed_orders
        WHERE tenant_id   = $1
          AND closed_date >= $2
          AND closed_date <= $3
          ${extra}`,
      countParams
    );
    const total = countResult.rows[0]?.total || 0;

    // Data query
    params.push(pageSize, offset);
    const dataResult = await query(
      `SELECT order_data
         FROM closed_orders
        WHERE tenant_id   = $1
          AND closed_date >= $2
          AND closed_date <= $3
          ${extra}
        ORDER BY closed_at DESC
        LIMIT  $${params.length - 1}
        OFFSET $${params.length}`,
      params
    );
    const orders = dataResult.rows.map((row) =>
      typeof row.order_data === "string" ? JSON.parse(row.order_data) : row.order_data
    );

    return { orders, total, page, pageSize };
  } catch (err) {
    console.error("[closed-orders.repo] LIST error:", err.message);
    return { orders: [], total: 0, page, pageSize };
  }
}

module.exports = { ensureClosedOrdersTable, insertClosedOrder, queryClosedOrders, listClosedOrders };
