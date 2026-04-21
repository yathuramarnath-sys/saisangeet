/**
 * Global email/phone → tenantId index.
 *
 * Primary storage: PostgreSQL `users_index` table.
 * Fallback:        .data/users-index.json (local dev / DB unavailable).
 * In-memory cache: pre-warmed at startup by migrate.js → warmUsersIndexCache().
 *
 * All public functions remain synchronous so callers need no changes.
 */

const fs   = require("fs");
const path = require("path");

const DATA_DIR   = path.join(__dirname, "..", "..", ".data");
const INDEX_FILE = path.join(DATA_DIR, "users-index.json");

// ── In-memory cache ──────────────────────────────────────────────────────────
// null = not yet loaded (cold start). Populated by warmUsersIndexCache().
let _index = null;

/**
 * Called by migrate.js at startup.
 */
function warmUsersIndexCache(map) {
  _index = { ...(map || {}) };
}

// ── File helpers ─────────────────────────────────────────────────────────────

function readIndexFromFile() {
  if (!fs.existsSync(INDEX_FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(INDEX_FILE, "utf8"));
  } catch (_) {
    return {};
  }
}

function writeIndexToFile(index) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  try {
    fs.writeFileSync(INDEX_FILE, JSON.stringify(index, null, 2));
  } catch (err) {
    console.error("[users-index] File write failed:", err.message);
  }
}

// ── Postgres helpers ─────────────────────────────────────────────────────────

function persistIdentifier(identifier, tenantId) {
  setImmediate(async () => {
    try {
      const { query } = require("../db/pool");
      await query(
        `INSERT INTO users_index (identifier, tenant_id)
         VALUES ($1, $2)
         ON CONFLICT (identifier)
         DO UPDATE SET tenant_id = EXCLUDED.tenant_id`,
        [identifier, tenantId]
      );
    } catch (err) {
      console.error("[users-index] Postgres write failed:", err.message);
    }
  });
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Register an email (and optional phone) → tenantId mapping.
 */
function registerUserInIndex(email, phone, tenantId) {
  // Ensure cache is initialised
  if (_index === null) _index = readIndexFromFile();

  if (email) {
    const key = email.toLowerCase().trim();
    _index[key] = tenantId;
    persistIdentifier(key, tenantId);
  }
  if (phone) {
    const key = phone.replace(/\s/g, "");
    _index[key] = tenantId;
    persistIdentifier(key, tenantId);
  }

  // Keep JSON file in sync as a backup
  writeIndexToFile(_index);
}

/**
 * Look up which tenantId owns a given identifier (email or phone).
 * Returns "default" if not found (preserves backward compat for admin user).
 */
function getTenantIdForIdentifier(identifier) {
  const key = identifier.toLowerCase().trim();

  // Fast path: in-memory cache
  if (_index !== null) {
    return _index[key] || "default";
  }

  // Cold-start fallback: read from JSON file
  const fileIndex = readIndexFromFile();
  _index = fileIndex; // cache for next call
  return fileIndex[key] || "default";
}

module.exports = {
  registerUserInIndex,
  getTenantIdForIdentifier,
  // Exported for migrate.js only:
  warmUsersIndexCache,
};
