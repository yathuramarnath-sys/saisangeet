/**
 * actionLog.service.js — structured action log for every POS mutation
 *
 * What it logs:
 *   ADD_ITEM, REMOVE_ITEM, ITEM_VOIDED,
 *   KOT_SENT, BILL_REQUESTED, BILL_NO_ASSIGNED,
 *   PAYMENT_RECORDED, ORDER_SETTLED
 *
 * How it stores:
 *   1. In-memory ring buffer (last MAX_IN_MEMORY per tenant) — instant, zero latency
 *   2. Postgres action_logs table — async, best-effort, never blocks the POS
 *
 * This module NEVER throws.  Every log failure is silently ignored.
 * The POS must never halt because a log entry failed.
 */

const MAX_IN_MEMORY = 1000;

// Per-tenant ring buffers: tenantId → entry[]
const _logs = new Map();

function _buf(tenantId) {
  if (!_logs.has(tenantId)) _logs.set(tenantId, []);
  return _logs.get(tenantId);
}

// ── Action constants ──────────────────────────────────────────────────────────

const ACTION = {
  ADD_ITEM:          "ADD_ITEM",
  REMOVE_ITEM:       "REMOVE_ITEM",
  ITEM_VOIDED:       "ITEM_VOIDED",
  KOT_SENT:          "KOT_SENT",
  BILL_REQUESTED:    "BILL_REQUESTED",
  BILL_NO_ASSIGNED:  "BILL_NO_ASSIGNED",
  PAYMENT_RECORDED:  "PAYMENT_RECORDED",
  ORDER_SETTLED:     "ORDER_SETTLED",
};

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Log an action.  Fire-and-forget — never awaited by callers.
 *
 * @param {object} opts
 * @param {string}  opts.tenantId
 * @param {string}  [opts.outletId]
 * @param {string}  [opts.tableId]
 * @param {string}  opts.action      — one of ACTION.*
 * @param {string}  [opts.actorName] — staff name / device role
 * @param {string}  [opts.device]    — "pos" | "captain" | "kds"
 * @param {object}  [opts.details]   — free-form metadata (item name, amount, kotNo, etc.)
 * @returns {object} entry
 */
function logAction({ tenantId = "default", outletId, tableId, action, actorName, device, details }) {
  try {
    const entry = {
      id:        `al-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      tenantId,
      outletId:  outletId  || null,
      tableId:   tableId   || null,
      action,
      actorName: actorName || null,
      device:    device    || null,
      details:   details   || null,
      createdAt: new Date().toISOString(),
    };

    // ── In-memory ring buffer ──────────────────────────────────────────────────
    const buf = _buf(tenantId);
    buf.push(entry);
    if (buf.length > MAX_IN_MEMORY) buf.splice(0, buf.length - MAX_IN_MEMORY);

    // ── Async Postgres write (best-effort, silently discarded on error) ────────
    _writeToDb(entry).catch(() => {});

    return entry;
  } catch (_) {
    // Swallow all errors — logging must never affect operations
    return null;
  }
}

async function _writeToDb(entry) {
  try {
    const { isDatabaseEnabled } = require("../../db/database-mode");
    if (!isDatabaseEnabled()) return;
    const { pool } = require("../../db/pool");
    await pool.query(
      `INSERT INTO action_logs
         (id, tenant_id, outlet_id, table_id, action, actor_name, device, details, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (id) DO NOTHING`,
      [
        entry.id,
        entry.tenantId,
        entry.outletId,
        entry.tableId,
        entry.action,
        entry.actorName,
        entry.device,
        entry.details ? JSON.stringify(entry.details) : null,
        entry.createdAt,
      ]
    );
  } catch (_) { /* silently ignored */ }
}

/**
 * Get recent logs from the in-memory buffer (newest first).
 * Used by Owner Console activity feed and table-level audit trail.
 *
 * @param {string} tenantId
 * @param {object} [filters]
 * @param {string} [filters.outletId]
 * @param {string} [filters.tableId]
 * @param {string} [filters.action]
 * @param {number} [filters.limit]
 */
function getActionLogs(tenantId, { outletId, tableId, action: actionFilter, limit = 200 } = {}) {
  let logs = [...(_logs.get(tenantId) || [])].reverse(); // newest first
  if (outletId)     logs = logs.filter(l => l.outletId === outletId);
  if (tableId)      logs = logs.filter(l => l.tableId  === tableId);
  if (actionFilter) logs = logs.filter(l => l.action   === actionFilter);
  return logs.slice(0, limit);
}

module.exports = { ACTION, logAction, getActionLogs };
