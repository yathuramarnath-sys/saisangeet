/**
 * Outlet-scoped localStorage helpers for the POS app.
 *
 * All operational data is prefixed with the outlet ID so that data from
 * different outlets never mixes on the same device — matching the Petpooja
 * model where each outlet's data is isolated by a unique system ID.
 *
 * Device-level keys (pos_token, pos_branch_config, pos_dark_mode, pos_printers,
 * pos_display_settings, pos_cache_version, update/whats-new banners) are NOT
 * routed through these helpers — use localStorage directly for those.
 */

function getOutletId() {
  try {
    const cfg = JSON.parse(localStorage.getItem("pos_branch_config") || "null");
    return cfg?.outletId ? String(cfg.outletId) : null;
  } catch {
    return null;
  }
}

/** Returns the outlet-prefixed key, e.g. "outlet_88833_pos_active_orders" */
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
 * Call this when the device switches to a different outlet so no data bleeds.
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
  "pos_active_orders",
  "pos_active_orders_outlet",
  "pos_closed_orders",
  "pos_closed_order_queue",
  "pos_active_shifts",
  "pos_shift_history",
  "pos_cash_movements",
  "pos_kot_queue",
  "pos_item_counts",
  "pos_discount_rules",
  "pos_kitchen_stations",
  "pos_table_config",
  "pos_receipt_appearance",
  "pos_security",
  "pos_config",
  "pos_staff",
  "pos_online_orders_enabled",
  "pos_last_synced",
  "pos_counter_ticket_num",
  "pos_wastage_log",
  "pos_wastage_sides",
  "pos_devices_assignments",
  "pos_credit_collections",
  "pos_last_label_batch",
  "pos_cache_outlet",
  "pos_cache_categories",
  "pos_cache_menu_items",
  "pos_cache_table_areas",
  "pos_print_queue",
  "pos_print_log",
];

export function migrateLegacyKeys() {
  const id = getOutletId();
  if (!id) return;
  const migrationKey = `pos_scoped_migration_v1_${id}`;
  if (localStorage.getItem(migrationKey)) return;

  LEGACY_KEYS_TO_MIGRATE.forEach(key => {
    const raw = localStorage.getItem(key);
    const scopedKey = `outlet_${id}_${key}`;
    if (raw !== null && localStorage.getItem(scopedKey) === null) {
      localStorage.setItem(scopedKey, raw);
    }
    localStorage.removeItem(key);
  });

  localStorage.setItem(migrationKey, "1");
  console.info(`[POS] Migrated localStorage to outlet-scoped keys (outlet ${id})`);
}
