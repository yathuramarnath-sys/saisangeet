// SQLite-backed persistence for the local POS store.
// Replaces local-orders.json + local-kot-seq.txt with dinex-pos.db.
// Uses better-sqlite3 (synchronous API — matches existing save/load pattern).

const path = require("path");

let db  = null;
let ins = null; // cached prepared INSERT inside transaction

function initDb(userDataPath) {
  const Database = require("better-sqlite3");
  const dbPath = path.join(userDataPath, "dinex-pos.db");
  db = new Database(dbPath);

  // WAL mode: writers don't block readers; safe on power cut
  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = NORMAL");

  db.exec(`
    CREATE TABLE IF NOT EXISTS orders (
      table_id   TEXT    PRIMARY KEY,
      data       TEXT    NOT NULL,
      updated_at INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
}

// ── Orders ────────────────────────────────────────────────────────────────────

const saveOrdersTx = () => db.transaction((store) => {
  db.prepare("DELETE FROM orders").run();
  const insert = db.prepare(
    "INSERT INTO orders (table_id, data, updated_at) VALUES (?, ?, ?)"
  );
  for (const [tableId, order] of Object.entries(store)) {
    insert.run(tableId, JSON.stringify(order), Number(order.updatedAt) || 0);
  }
});

function saveOrders(localOrderStore) {
  if (!db) return;
  try {
    saveOrdersTx()(localOrderStore);
  } catch (err) {
    console.error("[store] saveOrders error:", err.message);
  }
}

function loadOrders() {
  if (!db) return {};
  const rows  = db.prepare("SELECT table_id, data FROM orders").all();
  const store = {};
  for (const row of rows) {
    try { store[row.table_id] = JSON.parse(row.data); } catch (_) {}
  }
  return store;
}

// ── Settings ─────────────────────────────────────────────────────────────────

function saveSetting(key, value) {
  if (!db) return;
  db.prepare(
    "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
  ).run(key, String(value));
}

function loadSetting(key) {
  if (!db) return null;
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key);
  return row ? row.value : null;
}

module.exports = { initDb, saveOrders, loadOrders, saveSetting, loadSetting };
