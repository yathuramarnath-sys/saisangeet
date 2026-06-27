/**
 * categoryAvailability.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Shared, cross-app CATEGORY availability store backed by localStorage.
 * Sibling to stockAvailability.js (which is per-ITEM) — a category can be
 * disabled independently of any item's own sold-out state, e.g. "Beverages"
 * off because the soda machine is down, even though every drink item itself
 * is still marked Available.
 *
 * How it works:
 *  • POS cashier disables a category and picks a "next availability" time
 *    → saved to localStorage + broadcast over socket as `category:availability`
 *  • Captain App / KDS pick it up via the 'storage' event (cross-tab) or the
 *    'category-stock:changed' CustomEvent (same-tab), plus the socket event
 *  • The backend auto re-enables the category once `availableAt` passes and
 *    broadcasts that too — this local store also self-prunes past entries so
 *    the UI stays correct even if a socket event was missed.
 *
 * Key:  "category_availability"
 * Shape: { [categoryId]: { available: false, disabledAt: ISO, availableAt: ISO|null } }
 * Only DISABLED categories are stored — absent keys mean available.
 */

const STORAGE_KEY = "category_availability";
const EVENT_NAME   = "category-stock:changed";

function readState() {
  try {
    const raw  = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    const now  = Date.now();
    const live = {};
    for (const [id, entry] of Object.entries(raw)) {
      if (entry.available === false && (!entry.availableAt || new Date(entry.availableAt).getTime() > now)) {
        live[id] = entry;
      }
      // else: past its next-availability time — auto-reset → treated as available
    }
    return live;
  } catch {
    return {};
  }
}

function writeState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    window.dispatchEvent(new CustomEvent(EVENT_NAME));
  } catch (_) {}
}

/** Returns true if the category is available (default), false if disabled. */
export function isCategoryAvailable(categoryId) {
  return readState()[categoryId]?.available !== false;
}

/**
 * Mark a category as available (true) or disabled (false).
 * @param {string} categoryId
 * @param {boolean} available
 * @param {string|null} availableAt  ISO timestamp the cashier expects to restock; null = no ETA given
 */
export function setCategoryAvailability(categoryId, available, availableAt = null) {
  const state = readState();
  if (available) {
    delete state[categoryId];
  } else {
    state[categoryId] = {
      available:   false,
      disabledAt:  new Date().toISOString(),
      availableAt,
    };
  }
  writeState(state);
}

/** Returns the full state map { categoryId → entry } for disabled categories. */
export function getCategoryStockState() {
  return readState();
}

/**
 * Subscribe to category stock changes (same-tab CustomEvent + cross-tab StorageEvent).
 * Returns an unsubscribe function.
 */
export function subscribeCategoryStock(cb) {
  const onLocal   = ()  => cb(readState());
  const onStorage = (e) => { if (e.key === STORAGE_KEY) cb(readState()); };

  window.addEventListener(EVENT_NAME, onLocal);
  window.addEventListener("storage",  onStorage);

  return () => {
    window.removeEventListener(EVENT_NAME, onLocal);
    window.removeEventListener("storage",  onStorage);
  };
}

/** Reset ALL categories back to available immediately. */
export function resetAllCategoriesToAvailable() {
  writeState({});
}
