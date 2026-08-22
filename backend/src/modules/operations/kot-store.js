/**
 * kot-store.js
 * KOT store per tenant+outlet — backed by PostgreSQL for survive-restart durability.
 *
 * In-memory map is the hot path (all reads served from memory).
 * Every write (addKot, updateKotStatus) also writes to the `kitchen_kots` DB table.
 * On server startup, loadKotsFromDb() restores active KOTs so KDS never goes blank.
 *
 * Bumped KOTs are deleted from both memory and DB.
 * Fallback: if DB is unavailable, writes stay in memory only (graceful degradation).
 */

// Map<tenantId, Map<outletId, KOT[]>>
const store = new Map();

let _query = null; // pg query function — injected by init()

function init(queryFn) {
  _query = queryFn;
}

async function _dbWrite(op, ...args) {
  if (!_query) return;
  try { await op(...args); } catch (err) {
    console.error("[kot-store] DB write error:", err.message);
  }
}

// ── Memory helpers ────────────────────────────────────────────────────────────

function _ensureSlot(tenantId, outletId) {
  if (!store.has(tenantId)) store.set(tenantId, new Map());
  const t = store.get(tenantId);
  if (!t.has(outletId)) t.set(outletId, []);
  return t.get(outletId);
}

function getKots(tenantId, outletId) {
  const t = store.get(tenantId);
  if (!t) return [];
  return t.get(outletId) || [];
}

function addKot(tenantId, outletId, kot) {
  _ensureSlot(tenantId, outletId).push(kot);
  _dbWrite(async () => {
    await _query(
      `INSERT INTO kitchen_kots (id, tenant_id, outlet_id, status, data, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (id) DO UPDATE SET data = $5, status = $4`,
      [kot.id, tenantId, outletId, kot.status || "new", JSON.stringify(kot)]
    );
  });
}

function updateKotStatus(tenantId, outletId, kotId, status) {
  const kots = getKots(tenantId, outletId);
  const idx  = kots.findIndex((k) => k.id === kotId);
  if (idx === -1) return null;
  if (status === "bumped") {
    kots.splice(idx, 1);
    _dbWrite(async () => {
      await _query("DELETE FROM kitchen_kots WHERE id = $1 AND tenant_id = $2", [kotId, tenantId]);
    });
    return { id: kotId, status: "bumped" };
  }
  kots[idx] = { ...kots[idx], status };
  _dbWrite(async () => {
    await _query(
      "UPDATE kitchen_kots SET status = $1 WHERE id = $2 AND tenant_id = $3",
      [status, kotId, tenantId]
    );
  });
  return kots[idx];
}

// ── DB load on startup ────────────────────────────────────────────────────────

async function loadKotsFromDb() {
  if (!_query) return;
  try {
    const result = await _query(
      `SELECT tenant_id, outlet_id, data FROM kitchen_kots
       WHERE status != 'bumped'
       ORDER BY created_at ASC`
    );
    let count = 0;
    for (const row of result.rows) {
      try {
        const kot = JSON.parse(row.data);
        _ensureSlot(row.tenant_id, row.outlet_id).push(kot);
        count++;
      } catch (_) {}
    }
    if (count > 0) console.log(`[kot-store] restored ${count} active KOTs from DB`);
  } catch (err) {
    console.warn("[kot-store] could not load KOTs from DB:", err.message);
  }
}

module.exports = { init, getKots, addKot, updateKotStatus, loadKotsFromDb };
