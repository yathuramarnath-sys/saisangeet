/**
 * mutation-log.js — in-memory idempotency log for device mutations.
 *
 * Every mutating REST call from Captain / POS carries a client-generated
 * mutationId.  On the first call the server processes the request normally
 * and marks the id as seen.  On any retry (sync-queue flush, network
 * timeout where the request actually landed, etc.) the server short-circuits
 * and returns success without re-applying the mutation.
 *
 * Entries are held in memory only (no DB round-trip for the hot path) and
 * auto-purge after 24 hours.  A server restart clears the log — that window
 * is acceptable because a restart mid-service is brief and the sync-queue's
 * client-side duplicate-detection (e.g. alreadyThere check for ADD_ITEM)
 * acts as a fallback.
 */

const seen = new Map(); // mutationId → processedAtMs

/**
 * Returns true if this mutationId was already processed this session.
 * Always returns false for null / undefined / empty string so callers
 * that omit the field behave as before (no-op guard, not a block).
 */
function isProcessed(mutationId) {
  if (!mutationId) return false;
  return seen.has(mutationId);
}

/**
 * Mark a mutationId as processed.  No-op for falsy values.
 * Triggers a purge pass when the log exceeds 50,000 entries to cap memory.
 */
function markProcessed(mutationId) {
  if (!mutationId) return;
  seen.set(mutationId, Date.now());
  if (seen.size > 50_000) _purge();
}

function _purge() {
  const cutoff = Date.now() - 24 * 60 * 60 * 1_000;
  for (const [id, ts] of seen) {
    if (ts < cutoff) seen.delete(id);
  }
}

module.exports = { isProcessed, markProcessed };
