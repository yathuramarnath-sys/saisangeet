/**
 * printQueue.js — on-device print queue with automatic retry
 *
 * Problem it solves:
 *   Direct TCP prints (button → printer) have no recovery path.
 *   If the printer is offline, out of paper, or the network blips,
 *   the print silently fails and the receipt is lost.
 *
 * How it works:
 *   button click
 *     → enqueue()          saves PENDING entry to localStorage
 *     → flushQueue()       picks up PENDING → marks PRINTING → sends
 *         success          → entry removed from queue
 *         fail             → retryCount++ → back to PENDING (or FAILED after 3×)
 *     → startPrintWorker() retries every 10 s while PENDING entries exist
 *
 * States:
 *   PENDING  — waiting to send (new or waiting for retry)
 *   PRINTING — send in progress right now
 *   FAILED   — retried MAX_RETRIES times, gave up — shown in drawer
 *
 * Storage:
 *   localStorage key: "captain_print_queue"
 *   ESC/POS strings are stored as-is (JSON.stringify handles control chars).
 *   SUCCESS entries are removed immediately — no history kept.
 */

const QUEUE_KEY   = "captain_print_queue";
const MAX_RETRIES = 3;
const RETRY_MS    = 10_000;   // 10 seconds between retries (per user spec)

// ── Types ─────────────────────────────────────────────────────────────────────

export const PRINT_TYPE = {
  BILL: "BILL",
  KOT:  "KOT",
};

export const PRINT_STATUS = {
  PENDING:  "PENDING",
  PRINTING: "PRINTING",
  FAILED:   "FAILED",
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
 * Add a print job to the queue.
 * Returns the entry id so callers can track it if needed.
 *
 * @param {string} type        — PRINT_TYPE.BILL | PRINT_TYPE.KOT
 * @param {string} printerIp   — e.g. "192.168.1.200"
 * @param {string} escPosData  — full ESC/POS command string (latin1)
 * @param {object} meta        — display info only: { label, table, kotNo, billNo }
 */
export function enqueue(type, printerIp, escPosData, meta = {}) {
  const q = load();
  const entry = {
    id:         `pq-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    type,
    printerIp,
    escPosData,
    meta,
    status:     PRINT_STATUS.PENDING,
    retryCount: 0,
    createdAt:  new Date().toISOString(),
    printedAt:  null,
    error:      null,
  };
  q.push(entry);
  save(q);
  return entry.id;
}

/** Total entries in queue (PENDING + PRINTING + FAILED). */
export function getTotalCount() {
  return load().length;
}

/** Entries that are permanently failed (shown in drawer as warning). */
export function getFailedCount() {
  return load().filter(e => e.status === PRINT_STATUS.FAILED).length;
}

/** Entries still waiting to print (PENDING). */
export function getPendingCount() {
  return load().filter(e => e.status === PRINT_STATUS.PENDING).length;
}

/**
 * On app restart, any entry stuck in PRINTING (app was killed mid-send)
 * is reset to PENDING so it gets retried.
 */
export function resetStuck() {
  const q = load().map(e =>
    e.status === PRINT_STATUS.PRINTING
      ? { ...e, status: PRINT_STATUS.PENDING }
      : e
  );
  save(q);
}

// ── Flush logic ───────────────────────────────────────────────────────────────

let _flushing = false;

/**
 * Process the print queue — sends one entry at a time (serial).
 * Printers don't handle concurrent TCP connections well.
 *
 * @param {function} sendFn  async (ip, escPosData) => { ok, error }
 *   This is sendToThermalPrinter from thermalPrint.js.
 *   Passed in so printQueue.js stays free of Capacitor imports.
 */
export async function flushQueue(sendFn) {
  if (_flushing) return;
  _flushing = true;

  try {
    while (true) {
      const q    = load();
      const next = q.find(
        e => e.status === PRINT_STATUS.PENDING && e.retryCount < MAX_RETRIES
      );
      if (!next) break;

      // ── Mark PRINTING ──────────────────────────────────────────────────────
      save(q.map(e =>
        e.id === next.id ? { ...e, status: PRINT_STATUS.PRINTING } : e
      ));

      try {
        const result = await sendFn(next.printerIp, next.escPosData);
        if (!result?.ok) throw new Error(result?.error || "Printer returned failure");

        // ── Success — remove from queue ──────────────────────────────────────
        save(load().filter(e => e.id !== next.id));

      } catch (err) {
        // ── Failure — increment retry or mark FAILED ─────────────────────────
        const nextRetry = next.retryCount + 1;
        save(load().map(e =>
          e.id !== next.id ? e : {
            ...e,
            status:     nextRetry >= MAX_RETRIES ? PRINT_STATUS.FAILED : PRINT_STATUS.PENDING,
            retryCount: nextRetry,
            error:      String(err?.message || err),
          }
        ));

        // Stop processing after a failure — wait for the next retry interval
        // before trying again. Prevents hammering an offline printer.
        break;
      }
    }
  } finally {
    _flushing = false;
  }
}

// ── Background retry worker ───────────────────────────────────────────────────

let _timer = null;

/**
 * Start the background print retry worker.
 * Fires every RETRY_MS while there are PENDING entries.
 * Call resetStuck() first so app-restart entries get picked up.
 *
 * @param  {function} flushFn  () => void  — your app-specific flush wrapper
 * @return {function}          cleanup — call on component unmount
 */
export function startPrintWorker(flushFn) {
  resetStuck();   // reset any stuck PRINTING entries from last session

  if (_timer) clearInterval(_timer);
  _timer = setInterval(() => {
    if (getPendingCount() > 0) flushFn();
  }, RETRY_MS);

  return () => {
    clearInterval(_timer);
    _timer = null;
  };
}
