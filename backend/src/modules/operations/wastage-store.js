/**
 * wastage-store.js
 * In-memory + JSON-file store for production wastage logs.
 * Same pattern as closed-orders-store.js.
 */
const fs   = require("fs");
const path = require("path");

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "../../../.data");
if (!fs.existsSync(DATA_DIR)) {
  try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch (_) {}
}

function wastageFile(tenantId) {
  return path.join(DATA_DIR, `wastage-${tenantId || "default"}.json`);
}

// ── In-memory cache ─────────────────────────────────────────────────────────
const cache = {}; // tenantId → []

function loadFromDisk(tenantId) {
  if (cache[tenantId]) return cache[tenantId];
  try {
    const raw = fs.readFileSync(wastageFile(tenantId), "utf8");
    cache[tenantId] = JSON.parse(raw) || [];
  } catch (_) {
    cache[tenantId] = [];
  }
  return cache[tenantId];
}

function saveToDisk(tenantId) {
  try {
    fs.writeFileSync(wastageFile(tenantId), JSON.stringify(cache[tenantId] || [], null, 2));
  } catch (_) {}
}

// ── Public API ───────────────────────────────────────────────────────────────

function addWastageEntry(tenantId, entry) {
  const list = loadFromDisk(tenantId);
  list.push(entry);
  cache[tenantId] = list;
  saveToDisk(tenantId);
  return entry;
}

/**
 * Returns wastage entries for a date range (IST dates as YYYY-MM-DD strings).
 * Optional outletId filter.
 */
function getWastageForRange(tenantId, dateFrom, dateTo, outletId = null) {
  const list = loadFromDisk(tenantId);
  return list.filter(entry => {
    const entryDate = new Date(entry.timestamp)
      .toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }); // YYYY-MM-DD
    if (entryDate < dateFrom || entryDate > dateTo) return false;
    if (outletId && entry.outletId && entry.outletId !== outletId) return false;
    return true;
  });
}

module.exports = { addWastageEntry, getWastageForRange };
