/**
 * posPrintQueue.js — POS print queue with retry and print log
 *
 * When a KOT/bill print fails in Electron, the caller enqueues the job here.
 * A background worker retries every 10 s (up to MAX_RETRIES times) by calling
 * window.electronAPI.printHTML() again with the stored args.
 *
 * Also maintains pos_print_log (last 50 jobs) visible in Settings → Printers.
 */

const QUEUE_KEY   = "pos_print_queue";
const LOG_KEY     = "pos_print_log";
const MAX_RETRIES = 3;
const RETRY_MS    = 10_000;
const MAX_LOG     = 50;

// ── Print log ─────────────────────────────────────────────────────────────────

export function appendPrintLog(entry) {
  try {
    const log = JSON.parse(localStorage.getItem(LOG_KEY) || "[]");
    log.unshift({ ...entry, id: `pl-${Date.now()}`, timestamp: new Date().toISOString() });
    if (log.length > MAX_LOG) log.length = MAX_LOG;
    localStorage.setItem(LOG_KEY, JSON.stringify(log));
  } catch {}
}

export function getPrintLog() {
  try { return JSON.parse(localStorage.getItem(LOG_KEY) || "[]"); }
  catch { return []; }
}

export function clearPrintLog() {
  localStorage.removeItem(LOG_KEY);
}

// ── Queue helpers ─────────────────────────────────────────────────────────────

function loadQueue() {
  try { return JSON.parse(localStorage.getItem(QUEUE_KEY) || "[]"); }
  catch { return []; }
}
function saveQueue(q) {
  try { localStorage.setItem(QUEUE_KEY, JSON.stringify(q)); }
  catch {}
}

/** On app start, reset jobs stuck in PRINTING (app was killed mid-retry). */
export function resetStuckPrintJobs() {
  const q = loadQueue().map(e =>
    e.status === "PRINTING" ? { ...e, status: "PENDING" } : e
  );
  saveQueue(q);
}

export function getPendingPrintCount() {
  return loadQueue().filter(e => e.status === "PENDING").length;
}

export function getFailedPrintJobs() {
  return loadQueue().filter(e => e.status === "FAILED");
}

export function clearFailedPrintJobs() {
  saveQueue(loadQueue().filter(e => e.status !== "FAILED"));
}

/**
 * Enqueue a print job for retry after failure.
 * @param {string} type      — "KOT" | "Bill" | "Test"
 * @param {string} label     — e.g. "KOT-0012 T5" (for log display)
 * @param {object} printArgs — { html, printerName, printerIp, paperWidthMm }
 */
export function enqueuePrint(type, label, printArgs) {
  const q = loadQueue();
  q.push({
    id:         `pq-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    type,
    label,
    printArgs,
    status:     "PENDING",
    retryCount: 0,
    createdAt:  new Date().toISOString(),
    error:      null,
  });
  saveQueue(q);
}

// ── Flush ─────────────────────────────────────────────────────────────────────

let _flushing = false;

export async function flushPrintQueue() {
  if (_flushing || !window.electronAPI?.printHTML) return;
  _flushing = true;
  try {
    while (true) {
      const q    = loadQueue();
      const next = q.find(e => e.status === "PENDING" && e.retryCount < MAX_RETRIES);
      if (!next) break;

      saveQueue(q.map(e => e.id === next.id ? { ...e, status: "PRINTING" } : e));

      try {
        const result = await window.electronAPI.printHTML(next.printArgs);
        if (!result?.ok) throw new Error(result?.error || "Printer returned failure");

        saveQueue(loadQueue().filter(e => e.id !== next.id));
        appendPrintLog({
          type: next.type, label: next.label, status: "ok",
          printerName: next.printArgs.printerName,
          printerIp:   next.printArgs.printerIp,
          note: `Queued retry #${next.retryCount + 1}`,
        });
        // Continue to drain any remaining pending jobs
      } catch (err) {
        const nextRetry = next.retryCount + 1;
        const gaveUp    = nextRetry >= MAX_RETRIES;
        saveQueue(loadQueue().map(e => e.id !== next.id ? e : {
          ...e,
          status:     gaveUp ? "FAILED" : "PENDING",
          retryCount: nextRetry,
          error:      String(err?.message || err),
        }));
        if (gaveUp) {
          appendPrintLog({
            type: next.type, label: next.label, status: "fail",
            printerName: next.printArgs.printerName,
            printerIp:   next.printArgs.printerIp,
            error: String(err?.message || err),
            note: "Gave up after 3 retries",
          });
        }
        break; // stop — don't hammer a dead printer; wait for next interval
      }
    }
  } finally {
    _flushing = false;
  }
}

// ── Background worker ─────────────────────────────────────────────────────────

let _timer = null;

/**
 * Start the background retry worker. Call once on app mount.
 * Returns a cleanup function for useEffect.
 */
export function startPosPrintWorker() {
  resetStuckPrintJobs();
  if (_timer) clearInterval(_timer);
  _timer = setInterval(() => {
    if (getPendingPrintCount() > 0) flushPrintQueue();
  }, RETRY_MS);
  flushPrintQueue(); // drain any queued jobs from the previous session
  return () => { clearInterval(_timer); _timer = null; };
}
