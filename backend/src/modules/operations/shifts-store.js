/**
 * shifts-store.js
 * In-memory store for POS shift data (open shifts, closed shifts, cash movements).
 * Keyed by tenantId.
 * When ENABLE_DATABASE=true the store is persisted to app_runtime_state
 * so data survives server restarts.
 */

const { isDatabaseEnabled } = require("../../db/database-mode");
const { loadRuntimeState, saveRuntimeState } = require("../../db/runtime-state.repository");

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
  if (!isDatabaseEnabled()) return;
  saveRuntimeState(SCOPE, _toPlain()).catch(err =>
    console.error("[shifts-store] persist error:", err.message)
  );
}

async function _ensureLoaded() {
  if (_loaded || !isDatabaseEnabled()) { _loaded = true; return; }
  _loaded = true;
  try {
    const saved = await loadRuntimeState(SCOPE);
    if (saved) _fromPlain(saved);
  } catch (err) {
    console.error("[shifts-store] load error:", err.message);
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
