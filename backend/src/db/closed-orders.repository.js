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
      closed_at   TIMESTAMPTZ NOT NULL,
      order_data  JSONB       NOT NULL,
      received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (tenant_id, outlet_id, closed_at)
    )
  `);
  // For tables that were created before this fix (when closed_at was nullable),
  // strengthen the constraint — safe to ignore if already NOT NULL.
  await query(`ALTER TABLE closed_orders ALTER COLUMN closed_at SET NOT NULL`)
    .catch(() => {});
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
 * Paginates internally so report aggregation (e.g. "All Outlets", which has more
 * rows in the same range than any single outlet) never silently truncates — a
 * single capped query here previously caused all-outlets totals to undercount
 * vs. the sum of each outlet's own (smaller, under-the-cap) totals.
 *
 * @param {string}      tenantId
 * @param {object}      opts
 * @param {string}      opts.dateFrom   "YYYY-MM-DD" (inclusive) — defaults to today
 * @param {string}      opts.dateTo     "YYYY-MM-DD" (inclusive) — defaults to today
 * @param {string|null} opts.outletId   filter to one outlet, or null for all
 * @param {number}      opts.limit      hard ceiling on total rows returned (default 50000)
 * @returns {Promise<object[]>}  array of order objects (parsed from JSONB)
 */
async function queryClosedOrders(tenantId, { dateFrom, dateTo, outletId, limit = 50000 } = {}) {
  if (!isDatabaseEnabled()) return [];

  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  const from  = dateFrom || today;
  const to    = dateTo   || today;

  const PAGE_SIZE = 1000;
  const results   = [];

  try {
    for (let offset = 0; offset < limit; offset += PAGE_SIZE) {
      const pageLimit = Math.min(PAGE_SIZE, limit - offset);
      const params     = [tenantId, from, to];
      let   extra      = "";

      if (outletId) {
        params.push(outletId);
        extra = ` AND outlet_id = $${params.length}`;
      }
      params.push(pageLimit, offset);

      const r = await query(
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

      for (const row of r.rows) {
        results.push(typeof row.order_data === "string" ? JSON.parse(row.order_data) : row.order_data);
      }

      if (r.rows.length < pageLimit) break; // fetched fewer than asked — no more rows
    }
    return results;
  } catch (err) {
    console.error("[closed-orders.repo] SELECT error:", err.message);
    return results;
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
      `SELECT order_data, outlet_id
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
    const orders = dataResult.rows.map((row) => {
      const order = typeof row.order_data === "string" ? JSON.parse(row.order_data) : row.order_data;
      if (!order._outletId) order._outletId = row.outlet_id;
      return order;
    });

    return { orders, total, page, pageSize };
  } catch (err) {
    console.error("[closed-orders.repo] LIST error:", err.message);
    return { orders: [], total: 0, page, pageSize };
  }
}

/**
 * Update the order_data JSONB for an existing closed order.
 * Used when credit sale status changes (unpaid → paid settlement).
 * Matched by (tenant_id, outlet_id, closed_at) — the unique key.
 *
 * @param {string} tenantId
 * @param {string} outletId
 * @param {string} closedAt   — ISO timestamp of the original bill closure
 * @param {object} updatedOrder — full updated order object
 */
async function updateClosedOrderData(tenantId, outletId, closedAt, updatedOrder) {
  if (!isDatabaseEnabled()) return;
  try {
    await query(
      `UPDATE closed_orders
          SET order_data = $4
        WHERE tenant_id = $1
          AND outlet_id = $2
          AND closed_at = $3`,
      [tenantId, outletId, closedAt, JSON.stringify(updatedOrder)]
    );
  } catch (err) {
    console.error("[closed-orders.repo] UPDATE error:", err.message);
  }
}

/**
 * Query credit orders from Postgres — orders where isCreditSale is true.
 * Optionally filtered by date range (IST) and outletId.
 * Used by getCreditOrders to survive server restarts.
 *
 * @param {string}      tenantId
 * @param {object}      opts
 * @param {string|null} opts.dateFrom   "YYYY-MM-DD" (inclusive), or null = no lower bound
 * @param {string|null} opts.dateTo     "YYYY-MM-DD" (inclusive), or null = no upper bound
 * @param {string|null} opts.outletId   outlet filter, or null = all
 * @param {number}      opts.limit      max rows (default 5000)
 * @returns {Promise<object[]>}
 */
async function queryCreditOrders(tenantId, { dateFrom = null, dateTo = null, outletId = null, limit = 5000 } = {}) {
  if (!isDatabaseEnabled()) return [];

  const params = [tenantId];
  const conditions = ["tenant_id = $1", "order_data->>'isCreditSale' = 'true'"];

  if (dateFrom) {
    params.push(dateFrom);
    conditions.push(`closed_date >= $${params.length}`);
  }
  if (dateTo) {
    params.push(dateTo);
    conditions.push(`closed_date <= $${params.length}`);
  }
  if (outletId) {
    params.push(outletId);
    conditions.push(`outlet_id = $${params.length}`);
  }

  params.push(limit);
  const whereClause = conditions.join(" AND ");

  try {
    const r = await query(
      `SELECT order_data, outlet_id
         FROM closed_orders
        WHERE ${whereClause}
        ORDER BY closed_at DESC
        LIMIT $${params.length}`,
      params
    );
    return r.rows.map((row) => {
      const order = typeof row.order_data === "string" ? JSON.parse(row.order_data) : row.order_data;
      // Ensure _outletId is present (used by frontend grouping)
      if (!order._outletId) order._outletId = row.outlet_id;
      return order;
    });
  } catch (err) {
    console.error("[closed-orders.repo] queryCreditOrders error:", err.message);
    return [];
  }
}

/**
 * Load a single closed order from Postgres by (tenantId, outletId, closedAt).
 * Used by settleCreditOrder when the order is no longer in the in-memory store.
 */
async function getClosedOrderByClosedAt(tenantId, outletId, closedAt) {
  if (!isDatabaseEnabled()) return null;
  try {
    const r = await query(
      `SELECT order_data FROM closed_orders
        WHERE tenant_id = $1 AND outlet_id = $2 AND closed_at = $3
        LIMIT 1`,
      [tenantId, outletId, closedAt]
    );
    if (!r.rows.length) return null;
    const row = r.rows[0];
    return typeof row.order_data === "string" ? JSON.parse(row.order_data) : row.order_data;
  } catch (err) {
    console.error("[closed-orders.repo] getClosedOrderByClosedAt error:", err.message);
    return null;
  }
}

/**
 * Query Postgres for credit orders settled (paid) within a date range —
 * filtered on order_data->>'creditSettledAt', not closed_date, since a bill
 * can be closed on one day and settled days later.
 *
 * @param {string}      tenantId
 * @param {object}      opts
 * @param {string}      opts.dateFrom   "YYYY-MM-DD" (inclusive)
 * @param {string}      opts.dateTo     "YYYY-MM-DD" (inclusive)
 * @param {string|null} opts.outletId   outlet filter, or null = all
 * @returns {Promise<object[]>}
 */
async function queryCreditSettlementsForRange(tenantId, { dateFrom, dateTo, outletId = null } = {}) {
  if (!isDatabaseEnabled()) return [];

  const params = [tenantId, dateFrom, dateTo];
  const conditions = [
    "tenant_id = $1",
    "order_data->>'isCreditSale' = 'true'",
    "order_data->>'creditSettledAt' IS NOT NULL",
    "(order_data->>'creditSettledAt')::date >= $2::date",
    "(order_data->>'creditSettledAt')::date <= $3::date",
  ];

  if (outletId) {
    params.push(outletId);
    conditions.push(`outlet_id = $${params.length}`);
  }

  try {
    const r = await query(
      `SELECT order_data, outlet_id
         FROM closed_orders
        WHERE ${conditions.join(" AND ")}
        ORDER BY closed_at DESC`,
      params
    );
    return r.rows.map((row) => {
      const order = typeof row.order_data === "string" ? JSON.parse(row.order_data) : row.order_data;
      return { ...order, _outletId: row.outlet_id };
    });
  } catch (err) {
    console.error("[closed-orders.repo] queryCreditSettlementsForRange error:", err.message);
    return [];
  }
}

/**
 * Find a credit order from Postgres by orderId (id or orderNumber).
 * Searches across all outlets for the tenant.
 */
async function findCreditOrderById(tenantId, orderId) {
  if (!isDatabaseEnabled()) return null;
  try {
    // billNo is the only globally-unique identifier for a closed order — orderNumber is
    // derived from active-table position/count and gets reused across unrelated bills, so
    // matching on it (picking "most recent by closed_at") can silently return the wrong order.
    // Try billNo first; only fall back to the ambiguous id/orderNumber match if nothing matched.
    let r = await query(
      `SELECT order_data, outlet_id FROM closed_orders
        WHERE tenant_id = $1
          AND order_data->>'isCreditSale' = 'true'
          AND order_data->>'billNo' = $2
        ORDER BY closed_at DESC
        LIMIT 1`,
      [tenantId, String(orderId)]
    );
    if (!r.rows.length) {
      r = await query(
        `SELECT order_data, outlet_id FROM closed_orders
          WHERE tenant_id = $1
            AND order_data->>'isCreditSale' = 'true'
            AND (
              order_data->>'id' = $2
              OR order_data->>'orderNumber' = $2
            )
          ORDER BY closed_at DESC
          LIMIT 1`,
        [tenantId, String(orderId)]
      );
    }
    if (!r.rows.length) return null;
    const row = r.rows[0];
    const order = typeof row.order_data === "string" ? JSON.parse(row.order_data) : row.order_data;
    return { order, outletId: row.outlet_id };
  } catch (err) {
    console.error("[closed-orders.repo] findCreditOrderById error:", err.message);
    return null;
  }
}

module.exports = {
  ensureClosedOrdersTable,
  insertClosedOrder, queryClosedOrders, listClosedOrders, updateClosedOrderData,
  queryCreditOrders, queryCreditSettlementsForRange, getClosedOrderByClosedAt, findCreditOrderById,
};
