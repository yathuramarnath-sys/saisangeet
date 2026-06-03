/**
 * stock-store.js
 * In-memory + JSON-file store for finished-product inventory.
 * One stock count per item per outlet — no sessions.
 *
 * Entry shape: { itemId, outletId, currentStock, lowStockLevel, lastUpdatedAt, lastUpdatedBy }
 * Config shape: { allowNegative, trackedItems: [itemId] } per outletId
 */
const fs   = require("fs");
const path = require("path");

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "../../../.data");
if (!fs.existsSync(DATA_DIR)) {
  try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch (_) {}
}

// ── File helpers ──────────────────────────────────────────────────────────────
function stockFile(tenantId) {
  return path.join(DATA_DIR, `stock-${tenantId || "default"}.json`);
}
function configFile(tenantId) {
  return path.join(DATA_DIR, `stock-config-${tenantId || "default"}.json`);
}

const stockCache  = {}; // tenantId → { [outletId:itemId]: entry }
const configCache = {}; // tenantId → { [outletId]: { allowNegative, trackedItems } }

function loadStock(tenantId) {
  if (stockCache[tenantId]) return stockCache[tenantId];
  try { stockCache[tenantId] = JSON.parse(fs.readFileSync(stockFile(tenantId), "utf8")) || {}; }
  catch (_) { stockCache[tenantId] = {}; }
  return stockCache[tenantId];
}
function saveStock(tenantId) {
  try { fs.writeFileSync(stockFile(tenantId), JSON.stringify(stockCache[tenantId], null, 2)); }
  catch (_) {}
}

function loadConfig(tenantId) {
  if (configCache[tenantId]) return configCache[tenantId];
  try { configCache[tenantId] = JSON.parse(fs.readFileSync(configFile(tenantId), "utf8")) || {}; }
  catch (_) { configCache[tenantId] = {}; }
  return configCache[tenantId];
}
function saveConfig(tenantId) {
  try { fs.writeFileSync(configFile(tenantId), JSON.stringify(configCache[tenantId], null, 2)); }
  catch (_) {}
}

function stockKey(outletId, itemId) { return `${outletId}::${itemId}`; }

// ── Config (per outlet) ───────────────────────────────────────────────────────

function getOutletConfig(tenantId, outletId) {
  const cfg = loadConfig(tenantId);
  return cfg[outletId] || { allowNegative: false, trackedItems: [] };
}

function saveOutletConfig(tenantId, outletId, patch) {
  const cfg = loadConfig(tenantId);
  cfg[outletId] = { ...getOutletConfig(tenantId, outletId), ...patch };
  configCache[tenantId] = cfg;
  saveConfig(tenantId);
  return cfg[outletId];
}

// ── Stock entry helpers ───────────────────────────────────────────────────────

function getStock(tenantId, outletId, itemId) {
  const store = loadStock(tenantId);
  return store[stockKey(outletId, itemId)] || null;
}

function getOutletStock(tenantId, outletId) {
  const store  = loadStock(tenantId);
  const cfg    = getOutletConfig(tenantId, outletId);
  const result = {};
  for (const id of (cfg.trackedItems || [])) {
    const entry = store[stockKey(outletId, id)];
    result[id] = entry ? { ...entry } : { itemId: id, outletId, currentStock: 0, lowStockLevel: 0 };
  }
  return result;
}

/**
 * Add stock (cashier enters quantity made/received today).
 * Additive — adds to existing currentStock.
 */
function addStock(tenantId, outletId, itemId, qty, updatedBy) {
  const store = loadStock(tenantId);
  const key   = stockKey(outletId, itemId);
  const cur   = store[key] || { itemId, outletId, currentStock: 0, lowStockLevel: 0 };
  store[key] = {
    ...cur,
    currentStock:  (cur.currentStock || 0) + Number(qty),
    lastUpdatedAt: new Date().toISOString(),
    lastUpdatedBy: updatedBy || "cashier",
  };
  stockCache[tenantId] = store;
  saveStock(tenantId);
  return store[key];
}

/**
 * Set low stock level for an item (from menu item settings).
 */
function setLowStockLevel(tenantId, outletId, itemId, level) {
  const store = loadStock(tenantId);
  const key   = stockKey(outletId, itemId);
  const cur   = store[key] || { itemId, outletId, currentStock: 0, lowStockLevel: 0 };
  store[key] = { ...cur, lowStockLevel: Number(level) || 0 };
  stockCache[tenantId] = store;
  saveStock(tenantId);
  return store[key];
}

/**
 * Deduct stock when items are sold (called on KOT send).
 * items: [{ itemId, quantity }]
 * Returns { blocked: [itemId] } if allowNegative=false and any item would go below 0.
 */
function deductStock(tenantId, outletId, items) {
  const store  = loadStock(tenantId);
  const cfg    = getOutletConfig(tenantId, outletId);
  const trackedSet = new Set(cfg.trackedItems || []);

  const blocked = [];
  const deducted = [];

  for (const { itemId, quantity } of items) {
    if (!trackedSet.has(itemId)) continue; // not tracked — skip
    const key = stockKey(outletId, itemId);
    const cur = store[key] || { itemId, outletId, currentStock: 0, lowStockLevel: 0 };
    const newStock = (cur.currentStock || 0) - Number(quantity || 1);

    if (newStock < 0 && !cfg.allowNegative) {
      blocked.push(itemId);
      continue;
    }

    store[key] = { ...cur, currentStock: newStock, lastUpdatedAt: new Date().toISOString() };
    deducted.push({ itemId, newStock });
  }

  if (deducted.length) {
    stockCache[tenantId] = store;
    saveStock(tenantId);
  }

  return { blocked, deducted };
}

/**
 * Get full stock map for a POS sync — returns { [itemId]: { currentStock, lowStockLevel, allowNegative } }
 */
function getPosStockSnapshot(tenantId, outletId) {
  const store  = loadStock(tenantId);
  const cfg    = getOutletConfig(tenantId, outletId);
  const result = {};
  for (const id of (cfg.trackedItems || [])) {
    const entry = store[stockKey(outletId, id)];
    result[id]  = {
      currentStock:  entry?.currentStock  ?? 0,
      lowStockLevel: entry?.lowStockLevel ?? 0,
      allowNegative: cfg.allowNegative    ?? false,
    };
  }
  return result;
}

module.exports = {
  getOutletConfig, saveOutletConfig,
  getStock, getOutletStock, addStock, deductStock,
  setLowStockLevel, getPosStockSnapshot,
};
