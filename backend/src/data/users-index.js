/**
 * Global email → tenantId index.
 * Stored in .data/users-index.json
 * Used at login time to know which tenant to load before verifying credentials.
 */
const fs   = require("fs");
const path = require("path");

const DATA_DIR   = path.join(__dirname, "..", "..", ".data");
const INDEX_FILE = path.join(DATA_DIR, "users-index.json");

function readIndex() {
  if (!fs.existsSync(INDEX_FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(INDEX_FILE, "utf8"));
  } catch (_) {
    return {};
  }
}

function writeIndex(index) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(INDEX_FILE, JSON.stringify(index, null, 2));
}

/**
 * Register an email (and optional phone) → tenantId mapping.
 */
function registerUserInIndex(email, phone, tenantId) {
  const index = readIndex();
  if (email) index[email.toLowerCase().trim()] = tenantId;
  if (phone) index[phone.replace(/\s/g, "")]   = tenantId;
  writeIndex(index);
}

/**
 * Look up which tenantId owns a given identifier (email or phone).
 * Returns "default" if not found (preserves backward compat for admin user).
 */
function getTenantIdForIdentifier(identifier) {
  const index = readIndex();
  return index[identifier.toLowerCase().trim()] || "default";
}

module.exports = { registerUserInIndex, getTenantIdForIdentifier };
