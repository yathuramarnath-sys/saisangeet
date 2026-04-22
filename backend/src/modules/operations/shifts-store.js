/**
 * shifts-store.js
 * In-memory store for POS shift data (open shifts, closed shifts, cash movements).
 * Keyed by tenantId. Resets on server restart (same pattern as kot-store / closed-orders-store).
 */

/** @type {Map<string, { active: Array, history: Array, movements: Array }>} */
const store = new Map();

function _getTenant(tenantId) {
  if (!store.has(tenantId)) {
    store.set(tenantId, { active: [], history: [], movements: [] });
  }
  return store.get(tenantId);
}

/** Start a new shift (called when POS cashier opens a shift). */
function openShift(tenantId, shift) {
  const t = _getTenant(tenantId);
  // Remove any previous entry with the same id (idempotent)
  t.active = t.active.filter(s => s.id !== shift.id);
  t.active.unshift(shift);
}

/** Record a cash-in / cash-out movement and update running totals on the shift. */
function recordMovement(tenantId, movement) {
  const t = _getTenant(tenantId);
  t.movements.unshift(movement);

  // Keep only latest 1 000 movements
  if (t.movements.length > 1000) t.movements.splice(1000);

  // Update cashIn / cashOut totals on the matching active shift
  t.active = t.active.map(s => {
    if (s.id !== movement.shiftId) return s;
    return {
      ...s,
      cashIn:  movement.type === "in"  ? (s.cashIn  || 0) + movement.amount : (s.cashIn  || 0),
      cashOut: movement.type === "out" ? (s.cashOut || 0) + movement.amount : (s.cashOut || 0),
    };
  });
}

/** Close a shift — moves it from active → history. */
function closeShift(tenantId, closedShift) {
  const t = _getTenant(tenantId);
  // Remove from active
  t.active = t.active.filter(s => s.id !== closedShift.id);
  // Add to history (newest first)
  t.history.unshift(closedShift);
  if (t.history.length > 500) t.history.splice(500);
}

/**
 * Returns { active, history, movements } for the tenant.
 * Owner Web's ShiftsCashPage expects this shape.
 */
function getShifts(tenantId) {
  const t = _getTenant(tenantId);
  return {
    active:    [...t.active],
    history:   [...t.history],
    movements: [...t.movements],
  };
}

module.exports = { openShift, recordMovement, closeShift, getShifts };
