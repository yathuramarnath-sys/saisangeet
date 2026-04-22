/**
 * kot-store.js
 * Simple in-memory KOT store per tenant+outlet.
 * KOTs survive until bumped (removed) or the process restarts.
 * On restart, the KDS reconnects and refetches; we return an empty list
 * which is correct — no historical KOTs should remain on the KDS screen
 * after a server restart.
 */

// Map<tenantId, Map<outletId, KOT[]>>
const store = new Map();

function getKots(tenantId, outletId) {
  const t = store.get(tenantId);
  if (!t) return [];
  return t.get(outletId) || [];
}

function addKot(tenantId, outletId, kot) {
  if (!store.has(tenantId)) store.set(tenantId, new Map());
  const t = store.get(tenantId);
  if (!t.has(outletId)) t.set(outletId, []);
  t.get(outletId).push(kot);
}

function updateKotStatus(tenantId, outletId, kotId, status) {
  const kots = getKots(tenantId, outletId);
  const idx  = kots.findIndex((k) => k.id === kotId);
  if (idx === -1) return null;
  if (status === "bumped") {
    kots.splice(idx, 1); // remove bumped tickets
    return { id: kotId, status: "bumped" };
  }
  kots[idx] = { ...kots[idx], status };
  return kots[idx];
}

module.exports = { getKots, addKot, updateKotStatus };
