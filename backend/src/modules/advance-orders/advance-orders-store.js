/**
 * advance-orders-store.js
 *
 * PostgreSQL-backed store for advance orders (bookings with optional pre-ordered items).
 *
 * Statuses: pending | confirmed | checkedin | cancelled | noshow
 */

const { query } = require("../../db/pool");

// ── Row → JS object ───────────────────────────────────────────────────────────

function rowToOrder(row) {
  if (!row) return null;
  const d = row.date;
  return {
    id:              row.id,
    tenantId:        row.tenant_id,
    outletId:        row.outlet_id,
    customerName:    row.customer_name,
    phone:           row.phone,
    guests:          row.guests,
    date:            d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10),
    time:            row.time,
    note:            row.note,
    orderType:       row.order_type,
    items:           row.items || [],
    advanceAmount:   Number(row.advance_amount),
    advanceMethod:   row.advance_method,
    advanceRef:      row.advance_ref,
    status:          row.status,
    assignedTableId: row.assigned_table_id,
    createdAt:       row.created_at,
    updatedAt:       row.updated_at,
    checkedInAt:     row.checked_in_at,
    cancelledAt:     row.cancelled_at,
    noShowedAt:      row.no_showed_at,
    cancelReason:    row.cancel_reason,
  };
}

function generateId() {
  return `adv-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

// ── CRUD ──────────────────────────────────────────────────────────────────────

async function createAdvanceOrder(tenantId, outletId, payload) {
  const { rows } = await query(
    `INSERT INTO advance_orders
       (id, tenant_id, outlet_id, customer_name, phone, guests, date, time, note,
        order_type, items, advance_amount, advance_method, advance_ref, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'pending')
     RETURNING *`,
    [
      generateId(),
      tenantId,
      outletId,
      (payload.customerName || "").trim(),
      (payload.phone        || "").trim(),
      Number(payload.guests) || 1,
      payload.date || new Date().toISOString().slice(0, 10),
      payload.time || "12:00",
      (payload.note || "").trim(),
      payload.orderType || "dine-in",
      JSON.stringify(Array.isArray(payload.items) ? payload.items : []),
      Number(payload.advanceAmount) || 0,
      payload.advanceMethod || "",
      (payload.advanceRef || "").trim(),
    ]
  );
  return rowToOrder(rows[0]);
}

async function listAdvanceOrders(tenantId, outletId, { status } = {}) {
  const params = [tenantId, outletId];
  let whereStatus = "";
  if (status === "active") {
    whereStatus = "AND status IN ('pending', 'confirmed')";
  } else if (status) {
    params.push(status);
    whereStatus = `AND status = $${params.length}`;
  }
  const { rows } = await query(
    `SELECT * FROM advance_orders
     WHERE tenant_id = $1 AND outlet_id = $2 ${whereStatus}
     ORDER BY
       CASE WHEN status IN ('cancelled','noshow') THEN 1 ELSE 0 END,
       date ASC, time ASC`,
    params
  );
  return rows.map(rowToOrder);
}

async function getAdvanceOrder(tenantId, outletId, id) {
  const { rows } = await query(
    `SELECT * FROM advance_orders
     WHERE id = $1 AND tenant_id = $2 AND outlet_id = $3`,
    [id, tenantId, outletId]
  );
  return rowToOrder(rows[0] || null);
}

async function updateAdvanceOrder(tenantId, outletId, id, patch) {
  const existing = await getAdvanceOrder(tenantId, outletId, id);
  if (!existing) return null;
  if (["checkedin", "cancelled", "noshow"].includes(existing.status)) {
    return { error: "Cannot edit a checked-in, cancelled, or no-show order" };
  }

  const fieldMap = {
    customerName:  "customer_name",
    phone:         "phone",
    guests:        "guests",
    date:          "date",
    time:          "time",
    note:          "note",
    orderType:     "order_type",
    items:         "items",
    advanceAmount: "advance_amount",
    advanceMethod: "advance_method",
    advanceRef:    "advance_ref",
    status:        "status",
  };

  const setClauses = [];
  const values = [];

  for (const [jsKey, colName] of Object.entries(fieldMap)) {
    if (patch[jsKey] !== undefined) {
      values.push(jsKey === "items" ? JSON.stringify(patch[jsKey]) : patch[jsKey]);
      setClauses.push(`${colName} = $${values.length}`);
    }
  }

  if (setClauses.length === 0) return existing;

  values.push(id);      const idParam     = `$${values.length}`;
  values.push(tenantId); const tenantParam = `$${values.length}`;
  values.push(outletId); const outletParam = `$${values.length}`;

  const { rows } = await query(
    `UPDATE advance_orders
     SET ${setClauses.join(", ")}, updated_at = NOW()
     WHERE id = ${idParam} AND tenant_id = ${tenantParam} AND outlet_id = ${outletParam}
     RETURNING *`,
    values
  );
  return rowToOrder(rows[0] || null);
}

async function checkInAdvanceOrder(tenantId, outletId, id, { assignedTableId } = {}) {
  const existing = await getAdvanceOrder(tenantId, outletId, id);
  if (!existing)                        return null;
  if (existing.status === "cancelled")  return { error: "Order is cancelled" };
  if (existing.status === "checkedin")  return { error: "Already checked in" };
  if (existing.status === "noshow")     return { error: "Order is marked no-show" };

  const { rows } = await query(
    `UPDATE advance_orders
     SET status = 'checkedin', checked_in_at = NOW(), updated_at = NOW(),
         assigned_table_id = COALESCE($1, assigned_table_id)
     WHERE id = $2 AND tenant_id = $3 AND outlet_id = $4
     RETURNING *`,
    [assignedTableId || null, id, tenantId, outletId]
  );
  return rowToOrder(rows[0] || null);
}

async function cancelAdvanceOrder(tenantId, outletId, id, reason = "") {
  const existing = await getAdvanceOrder(tenantId, outletId, id);
  if (!existing)                        return null;
  if (existing.status === "checkedin")  return { error: "Cannot cancel a checked-in order" };

  const { rows } = await query(
    `UPDATE advance_orders
     SET status = 'cancelled', cancelled_at = NOW(), updated_at = NOW(), cancel_reason = $1
     WHERE id = $2 AND tenant_id = $3 AND outlet_id = $4
     RETURNING *`,
    [reason, id, tenantId, outletId]
  );
  return rowToOrder(rows[0] || null);
}

async function noShowAdvanceOrder(tenantId, outletId, id) {
  const existing = await getAdvanceOrder(tenantId, outletId, id);
  if (!existing)                        return null;
  if (existing.status === "checkedin")  return { error: "Cannot mark a checked-in order as no-show" };
  if (existing.status === "cancelled")  return { error: "Order is cancelled" };
  if (existing.status === "noshow")     return { error: "Already marked as no-show" };

  const { rows } = await query(
    `UPDATE advance_orders
     SET status = 'noshow', no_showed_at = NOW(), updated_at = NOW()
     WHERE id = $1 AND tenant_id = $2 AND outlet_id = $3
     RETURNING *`,
    [id, tenantId, outletId]
  );
  return rowToOrder(rows[0] || null);
}

// ── Exports ───────────────────────────────────────────────────────────────────

module.exports = {
  createAdvanceOrder,
  listAdvanceOrders,
  getAdvanceOrder,
  updateAdvanceOrder,
  checkInAdvanceOrder,
  cancelAdvanceOrder,
  noShowAdvanceOrder,
};
