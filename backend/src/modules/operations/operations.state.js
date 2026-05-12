const fs   = require("fs");
const path = require("path");

const { isDatabaseEnabled } = require("../../db/database-mode");
const { loadRuntimeState, saveRuntimeState } = require("../../db/runtime-state.repository");
const { getState, hydrateState } = require("./operations.memory-store");
const { getCurrentTenantId } = require("../../data/tenant-context");

// ── JSON file fallback ────────────────────────────────────────────────────────
// When Postgres is not enabled (ENABLE_DATABASE !== "true"), we persist active
// orders to a local JSON file on every write so a process crash / container
// restart doesn't wipe in-flight table orders.
//
// Limitation: Railway's filesystem is ephemeral across NEW DEPLOYS (not across
// restarts). For full durability across deploys, set ENABLE_DATABASE=true and
// attach a Railway Postgres service.

const DATA_DIR = path.resolve(__dirname, "../../../../.data");

function _snapshotPath(tenantId) {
  return path.join(DATA_DIR, `active-orders-${tenantId}.json`);
}

function _saveFallbackSnapshot(tenantId, state) {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(_snapshotPath(tenantId), JSON.stringify(state, null, 2), "utf8");
  } catch (err) {
    console.warn("[operations.state] fallback snapshot write failed:", err.message);
  }
}

function _loadFallbackSnapshot(tenantId) {
  try {
    const raw = fs.readFileSync(_snapshotPath(tenantId), "utf8");
    const parsed = JSON.parse(raw);
    console.log(`[operations.state] recovered active orders for tenant "${tenantId}" from snapshot`);
    return parsed;
  } catch (_) {
    return null; // file doesn't exist yet — normal on first boot
  }
}

// Tracks which tenants have already been hydrated from the JSON snapshot in
// this process lifetime. Avoids re-reading the file on every single API call.
const _snapshotHydrated = new Set();

// ── Scope key ─────────────────────────────────────────────────────────────────
// Per-tenant so each restaurant's state is stored in its own DB row:
// "<tenantId>:operations"  (e.g. "default:operations")
function _scope() {
  return `${getCurrentTenantId()}:operations`;
}

// ── Public API ────────────────────────────────────────────────────────────────

async function syncOperationsState() {
  if (isDatabaseEnabled()) {
    // Postgres path: load from DB on every call (DB is source of truth)
    const persistedState = await loadRuntimeState(_scope());
    if (persistedState) {
      return hydrateState(persistedState);
    }
    // First time this tenant has been seen — seed DB with current state
    const currentState = getState();
    await saveRuntimeState(_scope(), currentState);
    return currentState;
  }

  // JSON fallback path: hydrate once per tenant per process lifetime
  const tid = getCurrentTenantId();
  if (!_snapshotHydrated.has(tid)) {
    _snapshotHydrated.add(tid);
    const snapshot = _loadFallbackSnapshot(tid);
    if (snapshot) return hydrateState(snapshot);
  }

  return getState();
}

async function persistOperationsState() {
  const currentState = getState();
  const tid          = getCurrentTenantId();

  if (isDatabaseEnabled()) {
    await saveRuntimeState(_scope(), currentState);
  } else {
    // JSON fallback: write on every mutation so process restarts recover state
    _saveFallbackSnapshot(tid, currentState);
  }

  return currentState;
}

module.exports = {
  syncOperationsState,
  persistOperationsState
};
