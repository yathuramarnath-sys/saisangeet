/**
 * customer-order-store.js
 * Stores QR-submitted customer orders awaiting captain acceptance.
 *
 * Entry shape:
 *   { id, outletId, tableId, tableLabel, customerName, customerPhone,
 *     items: [{ id, name, price, quantity, notes }],
 *     status: "pending"|"accepted"|"rejected",
 *     createdAt }
 */
const fs   = require("fs");
const path = require("path");

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "../../../.data");
if (!fs.existsSync(DATA_DIR)) { try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch (_) {} }

function storeFile(tenantId) {
  return path.join(DATA_DIR, `customer-orders-${tenantId || "default"}.json`);
}

const cache = {}; // tenantId → [entries]

function load(tenantId) {
  if (cache[tenantId]) return cache[tenantId];
  try { cache[tenantId] = JSON.parse(fs.readFileSync(storeFile(tenantId), "utf8")) || []; }
  catch (_) { cache[tenantId] = []; }
  return cache[tenantId];
}

function save(tenantId) {
  try { fs.writeFileSync(storeFile(tenantId), JSON.stringify(cache[tenantId], null, 2)); }
  catch (_) {}
}

// Keep only last 24h of orders (auto-purge on load)
function purgeOld(tenantId) {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  cache[tenantId] = (cache[tenantId] || []).filter(o => new Date(o.createdAt).getTime() > cutoff);
}

function createOrder(tenantId, { outletId, tableId, tableLabel, customerName, customerPhone, items }) {
  load(tenantId);
  purgeOld(tenantId);
  const entry = {
    id:            `cqr-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    outletId,
    tableId,
    tableLabel:    tableLabel || tableId,
    customerName:  (customerName || "").trim(),
    customerPhone: (customerPhone || "").trim(),
    items:         items || [],
    status:        "pending",
    createdAt:     new Date().toISOString(),
  };
  cache[tenantId].push(entry);
  save(tenantId);
  return entry;
}

function getPendingOrders(tenantId, outletId) {
  load(tenantId);
  purgeOld(tenantId);
  return cache[tenantId].filter(o => o.outletId === outletId && o.status === "pending");
}

function updateStatus(tenantId, id, status) {
  load(tenantId);
  const entry = cache[tenantId].find(o => o.id === id);
  if (!entry) return null;
  entry.status = status;
  entry.updatedAt = new Date().toISOString();
  save(tenantId);
  return entry;
}

module.exports = { createOrder, getPendingOrders, updateStatus };
