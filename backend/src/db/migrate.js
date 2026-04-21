/**
 * migrate.js — runs on every server startup.
 *
 * 1. Creates the three new tables (idempotent — IF NOT EXISTS).
 * 2. Seeds those tables from JSON files if they are empty (first deploy).
 * 3. Pre-warms the in-memory caches in owner-setup-store and users-index
 *    so the first request is never a cache miss.
 *
 * Falls back gracefully if DATABASE_URL is not set / Postgres is unreachable.
 */

const fs   = require("fs");
const path = require("path");

const DATA_DIR    = path.join(__dirname, "..", "..", ".data");
const TENANTS_DIR = path.join(DATA_DIR, "tenants");

async function runMigrations() {
  let queryFn;
  try {
    const { query } = require("./pool");
    // Quick connectivity check
    await query("SELECT 1");
    queryFn = query;
    console.log("[migrate] PostgreSQL connected.");
  } catch (err) {
    console.warn("[migrate] PostgreSQL not available — using JSON file storage.", err.message);
    // Still pre-warm caches from JSON files
    await warmCachesFromFiles();
    return;
  }

  // ── 1. Create tables ────────────────────────────────────────────────────────
  await queryFn(`
    CREATE TABLE IF NOT EXISTS tenant_settings (
      tenant_id  TEXT NOT NULL,
      key        TEXT NOT NULL,
      value      JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (tenant_id, key)
    )
  `);

  await queryFn(`
    CREATE TABLE IF NOT EXISTS users_index (
      identifier TEXT PRIMARY KEY,
      tenant_id  TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await queryFn(`
    CREATE TABLE IF NOT EXISTS pending_link_tokens (
      link_code   TEXT PRIMARY KEY,
      outlet_code TEXT NOT NULL,
      outlet_id   TEXT NOT NULL DEFAULT '',
      tenant_id   TEXT NOT NULL DEFAULT 'default',
      expires_at  TIMESTAMPTZ NOT NULL,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  // Add outlet_id column if it was created without it (idempotent)
  await queryFn(`
    ALTER TABLE pending_link_tokens ADD COLUMN IF NOT EXISTS outlet_id TEXT NOT NULL DEFAULT ''
  `);

  console.log("[migrate] Tables verified.");

  // ── 2. Seed tenant_settings from JSON files ─────────────────────────────────
  // Default tenant
  const defaultFile = path.join(DATA_DIR, "owner-setup.json");
  if (fs.existsSync(defaultFile)) {
    try {
      const existing = await queryFn(
        "SELECT 1 FROM tenant_settings WHERE tenant_id = 'default' AND key = 'owner_setup'"
      );
      if (existing.rows.length === 0) {
        const data = JSON.parse(fs.readFileSync(defaultFile, "utf8"));
        await queryFn(
          "INSERT INTO tenant_settings (tenant_id, key, value) VALUES ('default', 'owner_setup', $1)",
          [JSON.stringify(data)]
        );
        console.log("[migrate] Seeded default tenant from owner-setup.json");
      }
    } catch (err) {
      console.error("[migrate] Could not seed default tenant:", err.message);
    }
  }

  // Other tenant files
  if (fs.existsSync(TENANTS_DIR)) {
    for (const file of fs.readdirSync(TENANTS_DIR)) {
      if (!file.endsWith(".json")) continue;
      const tenantId = path.basename(file, ".json");
      try {
        const existing = await queryFn(
          "SELECT 1 FROM tenant_settings WHERE tenant_id = $1 AND key = 'owner_setup'",
          [tenantId]
        );
        if (existing.rows.length === 0) {
          const data = JSON.parse(fs.readFileSync(path.join(TENANTS_DIR, file), "utf8"));
          await queryFn(
            "INSERT INTO tenant_settings (tenant_id, key, value) VALUES ($1, 'owner_setup', $2)",
            [tenantId, JSON.stringify(data)]
          );
          console.log(`[migrate] Seeded tenant ${tenantId}`);
        }
      } catch (err) {
        console.error(`[migrate] Could not seed tenant ${tenantId}:`, err.message);
      }
    }
  }

  // ── 3. Seed users_index ─────────────────────────────────────────────────────
  const indexFile = path.join(DATA_DIR, "users-index.json");
  if (fs.existsSync(indexFile)) {
    try {
      const count = await queryFn("SELECT COUNT(*)::int AS n FROM users_index");
      if (count.rows[0].n === 0) {
        const index = JSON.parse(fs.readFileSync(indexFile, "utf8"));
        for (const [identifier, tenantId] of Object.entries(index)) {
          await queryFn(
            "INSERT INTO users_index (identifier, tenant_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
            [identifier, tenantId]
          );
        }
        console.log("[migrate] Seeded users_index from JSON file");
      }
    } catch (err) {
      console.error("[migrate] Could not seed users_index:", err.message);
    }
  }

  // ── 4. Pre-warm in-memory caches ────────────────────────────────────────────
  await warmCachesFromDB(queryFn);

  console.log("[migrate] Done.");
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function warmCachesFromDB(queryFn) {
  try {
    const { warmTenantCache }   = require("../data/owner-setup-store");
    const { warmUsersIndexCache } = require("../data/users-index");

    // Load all tenant data into owner-setup-store cache
    const rows = await queryFn("SELECT tenant_id, value FROM tenant_settings WHERE key = 'owner_setup'");
    for (const row of rows.rows) {
      warmTenantCache(row.tenant_id, row.value);
    }
    console.log(`[migrate] Warmed ${rows.rows.length} tenant(s) in memory.`);

    // Load users index
    const idx = await queryFn("SELECT identifier, tenant_id FROM users_index");
    const map = {};
    for (const row of idx.rows) map[row.identifier] = row.tenant_id;
    warmUsersIndexCache(map);
    console.log(`[migrate] Warmed ${idx.rows.length} users_index entries.`);
  } catch (err) {
    console.error("[migrate] Cache warm failed:", err.message);
  }
}

async function warmCachesFromFiles() {
  try {
    const { warmTenantCache }     = require("../data/owner-setup-store");
    const { warmUsersIndexCache } = require("../data/users-index");

    // Default tenant
    const defaultFile = path.join(DATA_DIR, "owner-setup.json");
    if (fs.existsSync(defaultFile)) {
      const data = JSON.parse(fs.readFileSync(defaultFile, "utf8"));
      warmTenantCache("default", data);
    }

    // Other tenants
    if (fs.existsSync(TENANTS_DIR)) {
      for (const file of fs.readdirSync(TENANTS_DIR)) {
        if (!file.endsWith(".json")) continue;
        const tenantId = path.basename(file, ".json");
        const data = JSON.parse(fs.readFileSync(path.join(TENANTS_DIR, file), "utf8"));
        warmTenantCache(tenantId, data);
      }
    }

    // Users index
    const indexFile = path.join(DATA_DIR, "users-index.json");
    if (fs.existsSync(indexFile)) {
      warmUsersIndexCache(JSON.parse(fs.readFileSync(indexFile, "utf8")));
    }
  } catch (err) {
    console.error("[migrate] File cache warm failed:", err.message);
  }
}

module.exports = { runMigrations };
