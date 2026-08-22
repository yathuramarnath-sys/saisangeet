/**
 * availability-store.js
 * Persists sold-out item/category toggles to PostgreSQL `item_availability` table.
 * On server startup, restores the availability state so sold-out items survive deploys.
 *
 * Designed to wrap the existing in-memory outletAvailability / outletCategoryAvailability
 * objects in server.js — callers mutate those objects as before, then call save/load here.
 */

let _query = null;

function init(queryFn) {
  _query = queryFn;
}

async function _dbWrite(op) {
  if (!_query) return;
  try { await op(); } catch (err) {
    console.error("[availability-store] DB write error:", err.message);
  }
}

// ── Item availability ─────────────────────────────────────────────────────────

function saveItemAvailability(tenantId, outletId, itemId, available) {
  _dbWrite(async () => {
    if (available) {
      await _query(
        "DELETE FROM item_availability WHERE tenant_id = $1 AND outlet_id = $2 AND item_id = $3 AND kind = 'item'",
        [tenantId, outletId, itemId]
      );
    } else {
      await _query(
        `INSERT INTO item_availability (tenant_id, outlet_id, item_id, kind, available, updated_at)
         VALUES ($1, $2, $3, 'item', false, NOW())
         ON CONFLICT (tenant_id, outlet_id, item_id, kind) DO UPDATE SET available = false, updated_at = NOW()`,
        [tenantId, outletId, itemId]
      );
    }
  });
}

// ── Category availability ─────────────────────────────────────────────────────

function saveCategoryAvailability(tenantId, outletId, categoryId, available) {
  _dbWrite(async () => {
    if (available) {
      await _query(
        "DELETE FROM item_availability WHERE tenant_id = $1 AND outlet_id = $2 AND item_id = $3 AND kind = 'category'",
        [tenantId, outletId, categoryId]
      );
    } else {
      await _query(
        `INSERT INTO item_availability (tenant_id, outlet_id, item_id, kind, available, updated_at)
         VALUES ($1, $2, $3, 'category', false, NOW())
         ON CONFLICT (tenant_id, outlet_id, item_id, kind) DO UPDATE SET available = false, updated_at = NOW()`,
        [tenantId, outletId, categoryId]
      );
    }
  });
}

// ── Load on startup ───────────────────────────────────────────────────────────

async function loadAvailabilityFromDb(outletAvailability, outletCategoryAvailability) {
  if (!_query) return;
  try {
    const result = await _query(
      "SELECT tenant_id, outlet_id, item_id, kind FROM item_availability WHERE available = false"
    );
    let itemCount = 0, catCount = 0;
    for (const row of result.rows) {
      if (row.kind === "item") {
        if (!outletAvailability[row.outlet_id]) outletAvailability[row.outlet_id] = {};
        outletAvailability[row.outlet_id][row.item_id] = false;
        itemCount++;
      } else if (row.kind === "category") {
        if (!outletCategoryAvailability[row.outlet_id]) outletCategoryAvailability[row.outlet_id] = {};
        if (!outletCategoryAvailability[row.outlet_id][row.item_id]) {
          outletCategoryAvailability[row.outlet_id][row.item_id] = { available: false };
        }
        catCount++;
      }
    }
    if (itemCount + catCount > 0) {
      console.log(`[availability-store] restored ${itemCount} sold-out items, ${catCount} disabled categories from DB`);
    }
  } catch (err) {
    console.warn("[availability-store] could not load from DB:", err.message);
  }
}

module.exports = { init, saveItemAvailability, saveCategoryAvailability, loadAvailabilityFromDb };
