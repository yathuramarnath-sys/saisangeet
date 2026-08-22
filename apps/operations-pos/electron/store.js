// SQLite-backed persistence for the local POS store.
// Uses sql.js — pure WebAssembly SQLite (no native compilation; works on all platforms).
// Database file: dinex-pos.db in Electron userData directory.
//
// Workflow:
//   initDb(userDataPath) → async, returns when DB is ready
//   saveOrders(store)    → sync write to in-memory DB + atomic flush to disk
//   loadOrders()         → sync read from in-memory DB
//   saveSetting/loadSetting → simple key-value persistence (e.g. local_kot_seq)

const path = require("path");
const fs   = require("fs");

let db     = null;   // sql.js Database instance (lives in memory)
let dbPath = null;   // path to dinex-pos.db on disk

// ── Init ──────────────────────────────────────────────────────────────────────

async function initDb(userDataPath) {
  const initSqlJs = require("sql.js");

  // sql.js ships its own WASM file; resolve it from the package directory so
  // Electron can find it in both dev and packaged builds.
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
  `);

  // Flush immediately so the file exists even if nothing is stored yet
  _flush();
}

// ── Flush (atomic write) ──────────────────────────────────────────────────────
// Write to .tmp, then rename — rename is atomic on NTFS and APFS, so a
// power cut mid-write never leaves a corrupt dinex-pos.db.

function _flush() {
  if (!db || !dbPath) return;
  try {
    const data = db.export();          // Uint8Array of the full SQLite file
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

// ── Settings ─────────────────────────────────────────────────────────────────

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

module.exports = { initDb, saveOrders, loadOrders, saveKot, updateKotStatus, loadKots, saveSetting, loadSetting };
