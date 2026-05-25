/**
 * action-log-store.js
 * In-memory + JSON-file store for POS action logs:
 *   - void_item    : cashier voided a post-KOT item (PIN confirmed)
 *   - cancel_order : cashier cancelled entire order (PIN confirmed)
 *   - bill_reprint : bill was reprinted from POS or Captain App
 *
 * Same pattern as wastage-store.js.
 */
const fs   = require("fs");
const path = require("path");

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "../../../.data");
if (!fs.existsSync(DATA_DIR)) {
  try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch (_) {}
}

function logFile(tenantId) {
  return path.join(DATA_DIR, `action-log-${tenantId || "default"}.json`);
}

// In-memory cache: tenantId → []
const cache = {};

function loadFromDisk(tenantId) {
  if (cache[tenantId]) return cache[tenantId];
  try {
    const raw = fs.readFileSync(logFile(tenantId), "utf8");
    cache[tenantId] = JSON.parse(raw) || [];
  } catch (_) {
    cache[tenantId] = [];
  }
  return cache[tenantId];
}

function saveToDisk(tenantId) {
  try {
    fs.writeFileSync(logFile(tenantId), JSON.stringify(cache[tenantId] || [], null, 2));
  } catch (_) {}
}

// ── Public API ───────────────────────────────────────────────────────────────

function addActionLog(tenantId, entry) {
  const list = loadFromDisk(tenantId);
  const record = {
    id:        `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    timestamp: new Date().toISOString(),
    ...entry,
  };
  list.push(record);
  cache[tenantId] = list;
  saveToDisk(tenantId);
  return record;
}

/**
 * Returns action log entries filtered by type and optional date range.
 * types: ["void_item","cancel_order","bill_reprint"] or [] for all
 * dateFrom / dateTo: "YYYY-MM-DD" in IST
 */
function getActionLogs(tenantId, { types = [], dateFrom, dateTo } = {}) {
  const list = loadFromDisk(tenantId);

  return list.filter(e => {
    if (types.length && !types.includes(e.type)) return false;
    if (dateFrom || dateTo) {
      const d = (e.timestamp || "").slice(0, 10);
      if (dateFrom && d < dateFrom) return false;
      if (dateTo   && d > dateTo)   return false;
    }
    return true;
  }).sort((a, b) => (b.timestamp || "").localeCompare(a.timestamp || ""));
}

module.exports = { addActionLog, getActionLogs };
