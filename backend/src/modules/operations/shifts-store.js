/**
 * shifts-store.js
 * In-memory store for POS shift data (open shifts, closed shifts, cash movements).
 * Keyed by tenantId.
 * When ENABLE_DATABASE=true the store is persisted to app_runtime_state
 * so data survives server restarts.
 * When ENABLE_DATABASE is false, a JSON file fallback is used so shifts survive
 * process restarts (Railway container restarts, not full redeploys).
 */

const fs   = require("fs");
const path = require("path");

const { isDatabaseEnabled } = require("../../db/database-mode");
const { loadRuntimeState, saveRuntimeState } = require("../../db/runtime-state.repository");

// ── JSON file fallback ─────────────────────────────────────────────────────────
const DATA_DIR = path.resolve(__dirname, "../../../../.data");

function _shiftsFilePath() {
  return path.join(DATA_DIR, "shifts.json");
}

function _saveJsonFallback() {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(_shiftsFilePath(), JSON.stringify(_toPlain(), null, 2), "utf8");
  } catch (err) {
    console.warn("[shifts-store] JSON fallback write failed:", err.message);
  }
}

function _loadJsonFallback() {
  try {
    const raw = fs.readFileSync(_shiftsFilePath(), "utf8");
    const parsed = JSON.parse(raw);
    console.log("[shifts-store] hydrated shifts from JSON fallback file");
    return parsed;
  } catch (_) {
    return null; // file doesn't exist yet — normal on first boot
  }
}

const SCOPE = "shifts";

/** @type {Map<string, { active: Array, history: Array, movements: Array }>} */
const store = new Map();
let _loaded = false;

function _getTenant(tenantId) {
  if (!store.has(tenantId)) {
    store.set(tenantId, { active: [], history: [], movements: [] });
  }
  return store.get(tenantId);
}

function _toPlain() {
  const out = {};
  for (const [tid, data] of store.entries()) out[tid] = data;
  return out;
}

function _fromPlain(plain) {
  for (const [tid, data] of Object.entries(plain || {})) {
    store.set(tid, {
      active:    Array.isArray(data.active)    ? data.active    : [],
      history:   Array.isArray(data.history)   ? data.history   : [],
      movements: Array.isArray(data.movements) ? data.movements : [],
    });
  }
}

function _persist() {
  if (isDatabaseEnabled()) {
    saveRuntimeState(SCOPE, _toPlain()).catch(err =>
      console.error("[shifts-store] persist error:", err.message)
    );
  } else {
    _saveJsonFallback();
  }
}

async function _ensureLoaded() {
  if (_loaded) return;
  _loaded = true;
  if (isDatabaseEnabled()) {
    try {
      const saved = await loadRuntimeState(SCOPE);
      if (saved) _fromPlain(saved);
    } catch (err) {
      console.error("[shifts-store] load error:", err.message);
    }
  } else {
    const saved = _loadJsonFallback();
    if (saved) _fromPlain(saved);
  }
}

/** Call once at server startup to preload shifts from DB. */
async function hydrateShifts() {
  _loaded = false;
  await _ensureLoaded();
}

/** Start a new shift (called when POS cashier opens a shift). */
function openShift(tenantId, shift) {
  const t = _getTenant(tenantId);
  t.active = t.active.filter(s => s.id !== shift.id);
  t.active.unshift(shift);
  _persist();
}

/** Record a cash-in / cash-out movement and update running totals on the shift. */
function recordMovement(tenantId, movement) {
  const t = _getTenant(tenantId);
  t.movements.unshift(movement);
  if (t.movements.length > 1000) t.movements.splice(1000);

  t.active = t.active.map(s => {
    if (s.id !== movement.shiftId) return s;
    return {
      ...s,
      cashIn:  movement.type === "in"  ? (s.cashIn  || 0) + movement.amount : (s.cashIn  || 0),
      cashOut: movement.type === "out" ? (s.cashOut || 0) + movement.amount : (s.cashOut || 0),
    };
  });
  _persist();
}

/** Close a shift — moves it from active → history. */
function closeShift(tenantId, closedShift) {
  const t = _getTenant(tenantId);
  t.active = t.active.filter(s => s.id !== closedShift.id);
  t.history.unshift(closedShift);
  if (t.history.length > 500) t.history.splice(500);
  _persist();
}

/**
 * Returns { active, history, movements } for the tenant.
 */
function getShifts(tenantId) {
  const t = _getTenant(tenantId);
  return {
    active:    [...t.active],
    history:   [...t.history],
    movements: [...t.movements],
  };
}

module.exports = { openShift, recordMovement, closeShift, getShifts, hydrateShifts };
