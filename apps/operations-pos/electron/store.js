// SQLite-backed persistence for the local POS store.
// Uses sql.js — pure WebAssembly SQLite (no native compilation; works on all platforms).
// Database file: dinex-pos.db in Electron userData directory.
//
// Tables:
//   orders              — active table orders (tableId → JSON)
//   kots                — KOT snapshots for KDS bump
//   settings            — key/value (local_kot_seq, bill_seq_<outletId>, pos_token, api_base)
//   config              — larger JSON blobs (categories, menuItems, tables, staff, outlet)
//   closed_orders_queue — settlements pending cloud sync

const path = require("path");
const fs   = require("fs");

let db     = null;
let dbPath = null;

// ── Init ──────────────────────────────────────────────────────────────────────

async function initDb(userDataPath) {
  const initSqlJs = require("sql.js");

  const wasmPath = path.join(
    path.dirname(require.resolve("sql.js")),
    "sql-wasm.wasm"
  );

  const SQL = await initSqlJs({ locateFile: () => wasmPath });

  dbPath = path.join(userDataPath, "dinex-pos.db");

  if (fs.existsSync(dbPath)) {
    const data = fs.readFileSync(dbPath);
    db = new SQL.Database(data);
  } else {
    db = new SQL.Database();
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS orders (
      table_id   TEXT    PRIMARY KEY,
      data       TEXT    NOT NULL,
      updated_at INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS kots (
      kot_id     TEXT    PRIMARY KEY,
      data       TEXT    NOT NULL,
      status     TEXT    NOT NULL DEFAULT 'new',
      created_at INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS config (
      key        TEXT    PRIMARY KEY,
      value      TEXT    NOT NULL,
      updated_at INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS closed_orders_queue (
      id         TEXT    PRIMARY KEY,
      outlet_id  TEXT    NOT NULL,
      data       TEXT    NOT NULL,
      created_at INTEGER NOT NULL DEFAULT 0
    );
  `);

  _flush();
}

// ── Flush (atomic write) ──────────────────────────────────────────────────────

function _flush() {
  if (!db || !dbPath) return;
  try {
    const data = db.export();
    const tmp  = dbPath + ".tmp";
    fs.writeFileSync(tmp, Buffer.from(data));
    fs.renameSync(tmp, dbPath);
  } catch (err) {
    console.error("[store] flush error:", err.message);
  }
}

// ── Orders ────────────────────────────────────────────────────────────────────

function saveOrders(localOrderStore) {
  if (!db) return;
  try {
    db.run("BEGIN");
    db.run("DELETE FROM orders");
    const stmt = db.prepare(
      "INSERT INTO orders (table_id, data, updated_at) VALUES (?, ?, ?)"
    );
    for (const [tableId, order] of Object.entries(localOrderStore)) {
      stmt.run([tableId, JSON.stringify(order), Number(order.updatedAt) || 0]);
    }
    stmt.free();
    db.run("COMMIT");
    _flush();
  } catch (err) {
    try { db.run("ROLLBACK"); } catch (_) {}
    console.error("[store] saveOrders error:", err.message);
  }
}

function loadOrders() {
  if (!db) return {};
  const result = db.exec("SELECT table_id, data FROM orders");
  if (!result.length) return {};
  const store = {};
  for (const [tableId, data] of result[0].values) {
    try { store[tableId] = JSON.parse(data); } catch (_) {}
  }
  return store;
}

// ── KOTs ──────────────────────────────────────────────────────────────────────

function saveKot(kot) {
  if (!db) return;
  try {
    db.run(
      "INSERT INTO kots (kot_id, data, status, created_at) VALUES (?, ?, ?, ?) ON CONFLICT(kot_id) DO UPDATE SET data = excluded.data, status = excluded.status",
      [kot.id, JSON.stringify(kot), kot.status || "new", Date.now()]
    );
    _flush();
  } catch (err) {
    console.error("[store] saveKot error:", err.message);
  }
}

function updateKotStatus(kotId, status) {
  if (!db) return;
  try {
    db.run("UPDATE kots SET status = ? WHERE kot_id = ?", [status, kotId]);
    _flush();
  } catch (err) {
    console.error("[store] updateKotStatus error:", err.message);
  }
}

function loadKots() {
  if (!db) return {};
  const result = db.exec("SELECT kot_id, data, status FROM kots");
  if (!result.length) return {};
  const store = {};
  for (const [kotId, data, status] of result[0].values) {
    try {
      const kot = JSON.parse(data);
      store[kotId] = { ...kot, status };
    } catch (_) {}
  }
  return store;
}

// ── Settings (simple key/value) ───────────────────────────────────────────────

function saveSetting(key, value) {
  if (!db) return;
  db.run(
    "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    [key, String(value)]
  );
  _flush();
}

function loadSetting(key) {
  if (!db) return null;
  const result = db.exec("SELECT value FROM settings WHERE key = ?", [key]);
  if (!result.length || !result[0].values.length) return null;
  return result[0].values[0][0];
}

// ── Config (larger JSON blobs: menu, staff, tables, outlet) ───────────────────

function saveConfig(key, data) {
  if (!db) return;
  try {
    db.run(
      "INSERT INTO config (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
      [key, JSON.stringify(data), Date.now()]
    );
    _flush();
  } catch (err) {
    console.error("[store] saveConfig error:", err.message);
  }
}

function loadConfig(key) {
  if (!db) return null;
  const result = db.exec("SELECT value FROM config WHERE key = ?", [key]);
  if (!result.length || !result[0].values.length) return null;
  try { return JSON.parse(result[0].values[0][0]); } catch (_) { return null; }
}

// ── Bill sequence (per outlet) ────────────────────────────────────────────────

function nextBillNo(outletId) {
  if (!db) return null;
  const key = `bill_seq_${outletId}`;
  const raw = loadSetting(key);
  const next = raw ? parseInt(raw, 10) + 1 : 1001;
  saveSetting(key, String(next));
  return next;
}

// ── Closed orders queue (pending cloud sync) ──────────────────────────────────

function enqueueClosedOrder(id, outletId, orderData) {
  if (!db) return;
  try {
    db.run(
      "INSERT OR IGNORE INTO closed_orders_queue (id, outlet_id, data, created_at) VALUES (?, ?, ?, ?)",
      [id, outletId, JSON.stringify(orderData), Date.now()]
    );
    _flush();
  } catch (err) {
    console.error("[store] enqueueClosedOrder error:", err.message);
  }
}

function dequeueClosedOrder(id) {
  if (!db) return;
  try {
    db.run("DELETE FROM closed_orders_queue WHERE id = ?", [id]);
    _flush();
  } catch (err) {
    console.error("[store] dequeueClosedOrder error:", err.message);
  }
}

function loadClosedOrdersQueue() {
  if (!db) return [];
  const result = db.exec("SELECT id, outlet_id, data FROM closed_orders_queue ORDER BY created_at ASC");
  if (!result.length) return [];
  return result[0].values.map(([id, outletId, data]) => {
    try { return { id, outletId, data: JSON.parse(data) }; } catch (_) { return null; }
  }).filter(Boolean);
}

module.exports = {
  initDb,
  saveOrders, loadOrders,
  saveKot, updateKotStatus, loadKots,
  saveSetting, loadSetting,
  saveConfig, loadConfig,
  nextBillNo,
  enqueueClosedOrder, dequeueClosedOrder, loadClosedOrdersQueue,
};
