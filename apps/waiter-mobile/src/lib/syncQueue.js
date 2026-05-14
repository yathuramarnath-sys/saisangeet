/**
 * syncQueue.js — background sync queue for Captain app mutations
 *
 * Problem it solves:
 *   When the Captain app is briefly offline (or server is slow), direct API calls
 *   for ADD_ITEM / REMOVE_ITEM / BILL_REQUEST fail silently.  The local order and
 *   the server order diverge — items "ghost" back after reconnect, or the POS
 *   never sees the bill-request flag.
 *
 * How it works:
 *   1. Every mutation that fails is saved to localStorage as a PENDING entry.
 *   2. A background worker (startRetryWorker) fires every 30 s and retries all
 *      PENDING entries.
 *   3. On reconnect the worker is also called immediately.
 *   4. Each entry is retried up to MAX_RETRIES times.  After that it is marked
 *      FAILED so the owner can see there's a problem.
 *   5. Successful entries are removed from the queue.
 *
 * Queue entry shape:
 *   {
 *     id:         string   — "sq-<timestamp>-<random>"
 *     action:     string   — one of ACTION.*
 *     payload:    object   — body to POST/DELETE to the backend
 *     status:     string   — one of STATUS.*
 *     retryCount: number
 *     createdAt:  string   — ISO timestamp
 *     error:      string | null
 *   }
 */

const QUEUE_KEY   = "captain_sync_queue";
const MAX_RETRIES = 3;
const RETRY_MS    = 30_000; // 30 seconds

// ── Action names ──────────────────────────────────────────────────────────────
export const ACTION = {
  ADD_ITEM:     "ADD_ITEM",
  REMOVE_ITEM:  "REMOVE_ITEM",
  BILL_REQUEST: "BILL_REQUEST",
};

// ── Status values ─────────────────────────────────────────────────────────────
export const STATUS = {
  PENDING: "PENDING",
  FAILED:  "FAILED",
};

// ── Storage helpers ───────────────────────────────────────────────────────────

function load() {
  try { return JSON.parse(localStorage.getItem(QUEUE_KEY) || "[]"); }
  catch { return []; }
}

function save(q) {
  try { localStorage.setItem(QUEUE_KEY, JSON.stringify(q)); }
  catch {}
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Add a failed mutation to the queue for later retry.
 * Returns the entry id.
 */
export function enqueue(action, payload) {
  const q = load();
  const entry = {
    id:         `sq-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    action,
    payload,
    status:     STATUS.PENDING,
    retryCount: 0,
    createdAt:  new Date().toISOString(),
    error:      null,
  };
  q.push(entry);
  save(q);
  return entry.id;
}

/** Remove a successfully synced entry from the queue. */
function dequeue(id) {
  save(load().filter(e => e.id !== id));
}

/** Count of entries that haven't been synced yet (PENDING + FAILED). */
export function getPendingCount() {
  return load().length;
}

/** Count of permanently-failed entries (retried MAX_RETRIES times). */
export function getFailedCount() {
  return load().filter(e => e.status === STATUS.FAILED).length;
}

/**
 * Flush all PENDING entries.
 *
 * @param {function} handler  async (entry) => void
 *   Should throw on failure.  Called once per pending entry.
 *   For ADD_ITEM the handler must check server state first (see App.jsx) to
 *   avoid double-adding items that arrived via a later socket update.
 */
export async function flushQueue(handler) {
  const q = load();
  const pending = q.filter(e => e.status === STATUS.PENDING && e.retryCount < MAX_RETRIES);
  if (!pending.length) return;

  for (const entry of pending) {
    try {
      await handler(entry);
      dequeue(entry.id);                    // success — remove from queue
    } catch (err) {
      const next = e => {
        if (e.id !== entry.id) return e;
        const nextCount = e.retryCount + 1;
        return {
          ...e,
          retryCount: nextCount,
          status:     nextCount >= MAX_RETRIES ? STATUS.FAILED : STATUS.PENDING,
          error:      String(err?.message || err),
        };
      };
      save(load().map(next));
    }
  }
}

// ── Background retry worker ───────────────────────────────────────────────────

let _timer = null;

/**
 * Start the background retry worker.  Calls flushFn every RETRY_MS.
 * Returns a cleanup function — call it on component unmount.
 *
 * @param {function} flushFn  () => void  — your app-specific flush wrapper
 */
export function startRetryWorker(flushFn) {
  if (_timer) clearInterval(_timer);
  _timer = setInterval(() => {
    if (getPendingCount() > 0) flushFn();
  }, RETRY_MS);
  return () => {
    clearInterval(_timer);
    _timer = null;
  };
}
