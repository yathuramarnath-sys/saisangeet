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

  // ── 5. OWNER_PASSWORD override ───────────────────────────────────────────────
  // If OWNER_PASSWORD is set in env, forcibly update every tenant's owner hash
  // on startup. Set it in Railway, redeploy, log in, then remove it.
  await applyOwnerPasswordOverride(queryFn);

  // ── 6. Billing table ─────────────────────────────────────────────────────────
  try {
    const { ensureBillingTable } = require("../modules/billing/billing.service");
    await ensureBillingTable();
    console.log("[migrate] tenant_billing table verified.");
  } catch (err) {
    console.error("[migrate] Could not create tenant_billing table:", err.message);
  }

  // ── 7. Owner auth field repair ───────────────────────────────────────────────
  // Scan every tenant for owner accounts with missing email / passwordHash and
  // repair what can be recovered from users_index. Logs critical errors for any
  // tenants that still need manual attention (use OWNER_PASSWORD env var + redeploy).
  await repairOwnerAuthFields(queryFn);

  console.log("[migrate] Done.");
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function applyOwnerPasswordOverride(queryFn) {
  const plain = process.env.OWNER_PASSWORD;
  if (!plain) return; // env var not set — nothing to do

  try {
    const bcrypt = require("bcrypt");
    const { warmTenantCache } = require("../data/owner-setup-store");
    const { registerUserInIndex } = require("../data/users-index");

    const hash = await bcrypt.hash(String(plain), 10);
    console.log("[migrate] OWNER_PASSWORD set — applying password override to all tenants…");

    // Load every tenant, patch the owner's hash, save back to Postgres + cache
    const rows = await queryFn("SELECT tenant_id, value FROM tenant_settings WHERE key = 'owner_setup'");
    for (const row of rows.rows) {
      const data = typeof row.value === "string" ? JSON.parse(row.value) : row.value;
      const users = data.users || [];
      const ownerIdx = users.findIndex(u => (u.roles || []).includes("Owner"));
      if (ownerIdx < 0) continue;

      users[ownerIdx] = { ...users[ownerIdx], passwordHash: hash };
      data.users = users;

      // Save to Postgres
      await queryFn(
        `UPDATE tenant_settings SET value = $1, updated_at = NOW()
         WHERE tenant_id = $2 AND key = 'owner_setup'`,
        [JSON.stringify(data), row.tenant_id]
      );

      // Update in-memory cache so the running server reflects the change immediately
      warmTenantCache(row.tenant_id, data);

      // Ensure email is in users_index
      const ownerEmail = users[ownerIdx].email;
      if (ownerEmail) registerUserInIndex(ownerEmail, users[ownerIdx].phone || null, row.tenant_id);

      console.log(`[migrate] ✅ Owner password updated for tenant ${row.tenant_id} (${ownerEmail || "no email"})`);
    }
  } catch (err) {
    console.error("[migrate] OWNER_PASSWORD override failed:", err.message);
  }
}

/**
 * repairOwnerAuthFields — runs once on every startup after cache warm.
 *
 * For every tenant in Postgres:
 *  - Checks that at least one user with role "Owner" exists.
 *  - Checks that user has a non-empty `email` field.
 *  - If email is missing, attempts to recover it from the users_index table
 *    (the index maps email→tenantId, so a reverse lookup gives us back the email).
 *  - Saves the corrected record to Postgres + JSON file + in-memory cache.
 *  - Logs a CRITICAL error for any tenant where passwordHash is missing
 *    (can't be repaired without knowing the password — use OWNER_PASSWORD env var).
 *
 * This is idempotent: tenants that are already healthy produce no log output.
 */
async function repairOwnerAuthFields(queryFn) {
  try {
    const { warmTenantCache } = require("../data/owner-setup-store");

    const rows = await queryFn(
      "SELECT tenant_id, value FROM tenant_settings WHERE key = 'owner_setup'"
    );

    let repairedCount = 0;
    let warnCount     = 0;

    for (const row of rows.rows) {
      const data  = typeof row.value === "string" ? JSON.parse(row.value) : row.value;
      const users = data.users || [];

      const ownerUsers = users.filter((u) => (u.roles || []).includes("Owner"));

      if (ownerUsers.length === 0) {
        console.error(
          `[migrate] REPAIR ⚠ tenant ${row.tenant_id} has no Owner user — ` +
          "login is broken. Set OWNER_PASSWORD env var and redeploy to restore."
        );
        warnCount++;
        continue;
      }

      let tenantChanged = false;

      for (const owner of ownerUsers) {
        // ── Missing email? Try to recover from users_index ──────────────────
        if (!owner.email) {
          const idxRows = await queryFn(
            "SELECT identifier FROM users_index WHERE tenant_id = $1",
            [row.tenant_id]
          );
          const emailRow = idxRows.rows.find((r) => r.identifier.includes("@"));
          if (emailRow) {
            const recovered = emailRow.identifier;
            // Patch the user object inside the data copy
            const userIdx = data.users.findIndex((u) => u.id === owner.id);
            if (userIdx >= 0) data.users[userIdx].email = recovered;
            console.warn(
              `[migrate] REPAIR ✓ restored email "${recovered}" for owner ${owner.id} ` +
              `in tenant ${row.tenant_id}`
            );
            repairedCount++;
            tenantChanged = true;
          } else {
            console.error(
              `[migrate] REPAIR ⚠ owner ${owner.id} in tenant ${row.tenant_id} ` +
              "has no email and none found in users_index — login is broken."
            );
            warnCount++;
          }
        }

        // ── Missing passwordHash? Can't recover automatically ───────────────
        if (!owner.passwordHash) {
          console.error(
            `[migrate] REPAIR ⚠ owner ${owner.id} (${owner.email || "no email"}) ` +
            `in tenant ${row.tenant_id} has no passwordHash. ` +
            "Set OWNER_PASSWORD env var and redeploy to reset the password."
          );
          warnCount++;
        }
      }

      if (tenantChanged) {
        // Save repaired data back to Postgres + refresh in-memory cache
        await queryFn(
          `UPDATE tenant_settings SET value = $1, updated_at = NOW()
           WHERE tenant_id = $2 AND key = 'owner_setup'`,
          [JSON.stringify(data), row.tenant_id]
        );
        warmTenantCache(row.tenant_id, data);

        // Also write to JSON file so the file-based fallback is up to date
        const fsLib   = require("fs");
        const pathLib = require("path");
        const dataDir = path.join(__dirname, "..", "..", ".data");
        const file    = row.tenant_id === "default"
          ? pathLib.join(dataDir, "owner-setup.json")
          : pathLib.join(dataDir, "tenants", `${row.tenant_id}.json`);
        try { fsLib.writeFileSync(file, JSON.stringify(data, null, 2)); } catch (_) {}
      }
    }

    if (repairedCount > 0 || warnCount > 0) {
      console.log(
        `[migrate] Owner auth repair complete: ${repairedCount} field(s) restored, ` +
        `${warnCount} issue(s) need manual attention.`
      );
    } else {
      console.log("[migrate] Owner auth check: all tenants healthy ✓");
    }
  } catch (err) {
    console.error("[migrate] repairOwnerAuthFields failed:", err.message);
  }
}

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
