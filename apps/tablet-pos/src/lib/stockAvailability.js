/**
 * stockAvailability.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Shared, cross-app item availability store backed by localStorage.
 *
 * How it works:
 *  • Owner web marks an item "Sold Out"  → saved to localStorage
 *  • POS / Captain App / Online tabs pick it up via the 'storage' event
 *    (cross-tab) or the 'stock:changed' CustomEvent (same-tab)
 *  • Items auto-reset at midnight — if the resetDay stored is BEFORE today,
 *    the item is treated as Available again on next read.
 *  • Staff can also manually flip an item back ON at any time.
 *
 * Key:  "stock_availability"
 * Shape: { [itemId]: { available: false, soldOutAt: ISO, resetDay: "2026-04-21" } }
 * Only SOLD-OUT items are stored — absent keys mean Available.
 *
 * NOTE: resetDay uses ISO "YYYY-MM-DD" so lexicographic >= comparison is correct.
 */

const STORAGE_KEY  = "stock_availability";
const EVENT_NAME   = "stock:changed";

// ─── internal helpers ────────────────────────────────────────────────────────

/** Returns "YYYY-MM-DD" for today — compares correctly as a plain string. */
function isoDate(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function todayString()    { return isoDate(); }
function tomorrowString() { return isoDate(new Date(Date.now() + 86_400_000)); }

/** Read raw state from localStorage, pruning auto-reset items. */
function readState() {
  try {
    const raw   = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    const today = todayString();
    const live  = {};
    for (const [id, entry] of Object.entries(raw)) {
      // If resetDay is today or later, keep the sold-out status
      if (entry.available === false && entry.resetDay >= today) {
        live[id] = entry;
      }
      // else: auto-reset — omit → treated as available
    }
    return live;
  } catch {
    return {};
  }
}

function writeState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    // Notify same-tab listeners
    window.dispatchEvent(new CustomEvent(EVENT_NAME));
  } catch (_) {}
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Returns true if the item is available (default), false if sold-out.
 * Auto-reset is applied on every read.
 */
export function isAvailable(itemId) {
  return readState()[itemId]?.available !== false;
}

/**
 * Mark an item as available (true) or sold-out (false).
 * Sold-out items auto-reset the following calendar day.
 */
export function setItemAvailability(itemId, available) {
  const state = readState();
  if (available) {
    delete state[itemId];
  } else {
    state[itemId] = {
      available:  false,
      soldOutAt:  new Date().toISOString(),
      resetDay:   tomorrowString(),   // auto-reset next day
    };
  }
  writeState(state);
}

/**
 * Returns the full state map { itemId → entry } for items that are sold-out.
 * Available items are simply absent.
 */
export function getStockState() {
  return readState();
}

/**
 * Subscribe to stock changes (same-tab CustomEvent + cross-tab StorageEvent).
 * Returns an unsubscribe function.
 *
 * @param {(state: object) => void} cb  called with the latest stock state
 */
export function subscribeStock(cb) {
  const onLocal   = ()  => cb(readState());
  const onStorage = (e) => { if (e.key === STORAGE_KEY) cb(readState()); };

  window.addEventListener(EVENT_NAME, onLocal);
  window.addEventListener("storage",  onStorage);

  return () => {
    window.removeEventListener(EVENT_NAME, onLocal);
    window.removeEventListener("storage",  onStorage);
  };
}

/**
 * Reset ALL items back to available immediately.
 */
export function resetAllToAvailable() {
  writeState({});
}
