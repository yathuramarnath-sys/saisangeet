/**
 * Outlet-scoped localStorage helpers for the Captain app.
 *
 * All operational data is prefixed with the outlet ID so that data from
 * different outlets never mixes on the same device.
 *
 * Device-level keys (captain_token, captain_branch_config, captain_local_server_ip,
 * captain_printers, captain_printer_ip, captain_paper_size, captain_cache_version)
 * are NOT routed through these helpers — use localStorage directly for those.
 */

function getOutletId() {
  try {
    const cfg = JSON.parse(localStorage.getItem("captain_branch_config") || "null");
    return cfg?.outletId ? String(cfg.outletId) : null;
  } catch {
    return null;
  }
}

/** Returns the outlet-prefixed key, e.g. "outlet_88833_captain_pending_kots" */
export function outletKey(baseKey) {
  const id = getOutletId();
  return id ? `outlet_${id}_${baseKey}` : baseKey;
}

/** Read a JSON value from outlet-scoped storage. */
export function lsGet(baseKey, fallback = null) {
  try {
    const raw = localStorage.getItem(outletKey(baseKey));
    return raw !== null ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

/** Read a raw string from outlet-scoped storage. */
export function lsGetStr(baseKey, fallback = "") {
  return localStorage.getItem(outletKey(baseKey)) ?? fallback;
}

/** Write to outlet-scoped storage. Strings are stored as-is; everything else is JSON-encoded. */
export function lsSet(baseKey, val) {
  try {
    localStorage.setItem(
      outletKey(baseKey),
      typeof val === "string" ? val : JSON.stringify(val),
    );
  } catch (_) {}
}

/** Remove an outlet-scoped key. */
export function lsRemove(baseKey) {
  try { localStorage.removeItem(outletKey(baseKey)); } catch {}
}

/**
 * Wipe ALL scoped keys for a given outlet ID.
 * Call this when the device re-pairs to a different outlet.
 */
export function wipeOutletStorage(outletId) {
  const prefix = `outlet_${outletId}_`;
  Object.keys(localStorage)
    .filter(k => k.startsWith(prefix))
    .forEach(k => { try { localStorage.removeItem(k); } catch {} });
}

/**
 * One-time migration: copy unscoped legacy keys → outlet-scoped keys.
 * Safe to call on every boot — skips immediately if already done for this outlet.
 */
const LEGACY_KEYS_TO_MIGRATE = [
  "captain_pending_kots",
  "captain_sent_kots",
  "captain_sync_queue",
  "captain_print_queue",
  "captain_cache_outlet",
  "captain_cache_categories",
  "captain_cache_menu_items",
  "captain_cache_areas",
  "captain_kitchen_stations",
  "captain_pos_config",
  "captain_last_staff_id",
];

export function migrateLegacyKeys() {
  const id = getOutletId();
  if (!id) return;
  const migrationKey = `captain_scoped_migration_v1_${id}`;
  if (localStorage.getItem(migrationKey)) return;

  // Migrate standard keys
  LEGACY_KEYS_TO_MIGRATE.forEach(key => {
    const raw = localStorage.getItem(key);
    const scopedKey = `outlet_${id}_${key}`;
    if (raw !== null && localStorage.getItem(scopedKey) === null) {
      localStorage.setItem(scopedKey, raw);
    }
    localStorage.removeItem(key);
  });

  // Migrate captain_courses_${tableId} — scan for all matching keys
  Object.keys(localStorage)
    .filter(k => k.startsWith("captain_courses_"))
    .forEach(k => {
      const raw = localStorage.getItem(k);
      const scopedKey = `outlet_${id}_${k}`;
      if (raw !== null && localStorage.getItem(scopedKey) === null) {
        localStorage.setItem(scopedKey, raw);
      }
      localStorage.removeItem(k);
    });

  localStorage.setItem(migrationKey, "1");
  console.info(`[Captain] Migrated localStorage to outlet-scoped keys (outlet ${id})`);
}
