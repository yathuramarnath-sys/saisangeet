/**
 * advance-orders-store.js
 *
 * In-memory store for advance orders (reservations with pre-ordered items).
 * Persists to a JSON file under .data/ so orders survive server restarts.
 *
 * Data model per advance order:
 * {
 *   id            : "adv-<timestamp>-<random>",
 *   tenantId      : "default",
 *   outletId      : "outlet_id",
 *   customerName  : "Rahul Kumar",
 *   phone         : "9876543210",
 *   guests        : 4,
 *   date          : "2026-05-15",      // YYYY-MM-DD
 *   time          : "19:00",
 *   note          : "Window seat",
 *   items         : [{ menuItemId, name, price, quantity }],
 *   advanceAmount : 500,
 *   advanceMethod : "cash",            // "cash" | "card" | "upi" | ""
 *   advanceRef    : "UPI ref / txn",
 *   status        : "pending",         // "pending" | "confirmed" | "checkedin" | "cancelled"
 *   assignedTableId : null,
 *   createdAt     : "ISO",
 *   updatedAt     : "ISO",
 *   checkedInAt   : null,
 *   cancelledAt   : null,
 *   cancelReason  : ""
 * }
 */

const fs   = require("fs");
const path = require("path");

// ── Persistence ───────────────────────────────────────────────────────────────

const DATA_DIR  = path.resolve(__dirname, "../../../../.data");
const DATA_FILE = path.join(DATA_DIR, "advance-orders.json");

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function loadFromDisk() {
  try {
    ensureDataDir();
    if (!fs.existsSync(DATA_FILE)) return {};
    const raw = fs.readFileSync(DATA_FILE, "utf8");
    return JSON.parse(raw) || {};
  } catch {
    return {};
  }
}

function saveToDisk(data) {
  try {
    ensureDataDir();
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), "utf8");
  } catch {
    // Silent — in-memory state is still correct
  }
}

// ── In-memory store ───────────────────────────────────────────────────────────
// Keyed: Map<tenantId, Map<outletId, advance[]>>

/** @type {Map<string, Map<string, Array>>} */
let _store = null;

function getStore() {
  if (!_store) {
    _store = new Map();
    const disk = loadFromDisk();
    for (const [tenantId, outlets] of Object.entries(disk)) {
      const outletMap = new Map();
      for (const [outletId, orders] of Object.entries(outlets)) {
        outletMap.set(outletId, orders || []);
      }
      _store.set(tenantId, outletMap);
    }
  }
  return _store;
}

function getOutletOrders(tenantId, outletId) {
  const store     = getStore();
  if (!store.has(tenantId))   store.set(tenantId, new Map());
  const outletMap = store.get(tenantId);
  if (!outletMap.has(outletId)) outletMap.set(outletId, []);
  return outletMap.get(outletId);
}

function persist() {
  const store = getStore();
  const out   = {};
  for (const [tenantId, outletMap] of store.entries()) {
    out[tenantId] = {};
    for (const [outletId, orders] of outletMap.entries()) {
      out[tenantId][outletId] = orders;
    }
  }
  saveToDisk(out);
}

// ── CRUD helpers ──────────────────────────────────────────────────────────────

function generateId() {
  return `adv-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * Create a new advance order.
 */
function createAdvanceOrder(tenantId, outletId, payload) {
  const now    = new Date().toISOString();
  const order  = {
    id:             generateId(),
    tenantId,
    outletId,
    customerName:   (payload.customerName || "").trim(),
    phone:          (payload.phone        || "").trim(),
    guests:         Number(payload.guests)  || 1,
    date:           payload.date            || now.slice(0, 10),
    time:           payload.time            || "12:00",
    note:           (payload.note || "").trim(),
    orderType:      payload.orderType      || "dine-in", // "dine-in" | "takeaway" | "delivery"
    items:          Array.isArray(payload.items) ? payload.items : [],
    advanceAmount:  Number(payload.advanceAmount) || 0,
    advanceMethod:  payload.advanceMethod  || "",
    advanceRef:     (payload.advanceRef    || "").trim(),
    status:         "pending",
    assignedTableId: null,
    createdAt:      now,
    updatedAt:      now,
    checkedInAt:    null,
    cancelledAt:    null,
    cancelReason:   "",
  };

  const list = getOutletOrders(tenantId, outletId);
  list.push(order);
  persist();
  return order;
}

/**
 * List advance orders for an outlet.
 * Optional status filter: "pending" | "confirmed" | "checkedin" | "cancelled" | "active" (pending+confirmed)
 */
function listAdvanceOrders(tenantId, outletId, { status } = {}) {
  const list = [...getOutletOrders(tenantId, outletId)];

  if (status === "active") {
    return list.filter((o) => o.status === "pending" || o.status === "confirmed");
  }
  if (status) {
    return list.filter((o) => o.status === status);
  }
  return list;
}

/**
 * Get a single advance order by id.
 */
function getAdvanceOrder(tenantId, outletId, id) {
  return getOutletOrders(tenantId, outletId).find((o) => o.id === id) || null;
}

/**
 * Update an advance order (edit).
 * Only editable fields — status must be pending or confirmed.
 */
function updateAdvanceOrder(tenantId, outletId, id, patch) {
  const list  = getOutletOrders(tenantId, outletId);
  const idx   = list.findIndex((o) => o.id === id);
  if (idx === -1) return null;

  const order = list[idx];
  if (order.status === "checkedin" || order.status === "cancelled") {
    return { error: "Cannot edit a checked-in or cancelled order" };
  }

  const allowed = [
    "customerName", "phone", "guests", "date", "time", "note",
    "orderType", "items", "advanceAmount", "advanceMethod", "advanceRef", "status"
  ];
  for (const key of allowed) {
    if (patch[key] !== undefined) order[key] = patch[key];
  }
  order.updatedAt = new Date().toISOString();
  list[idx] = order;
  persist();
  return order;
}

/**
 * Mark as checked in (converts to live order — status update only).
 * Returns updated order or error object.
 */
function checkInAdvanceOrder(tenantId, outletId, id, { assignedTableId } = {}) {
  const list = getOutletOrders(tenantId, outletId);
  const idx  = list.findIndex((o) => o.id === id);
  if (idx === -1) return null;

  const order = list[idx];
  if (order.status === "cancelled") return { error: "Order is cancelled" };
  if (order.status === "checkedin") return { error: "Already checked in" };

  order.status          = "checkedin";
  order.checkedInAt     = new Date().toISOString();
  order.updatedAt       = order.checkedInAt;
  if (assignedTableId)  order.assignedTableId = assignedTableId;
  list[idx] = order;
  persist();
  return order;
}

/**
 * Cancel an advance order.
 */
function cancelAdvanceOrder(tenantId, outletId, id, reason = "") {
  const list = getOutletOrders(tenantId, outletId);
  const idx  = list.findIndex((o) => o.id === id);
  if (idx === -1) return null;

  const order = list[idx];
  if (order.status === "checkedin") return { error: "Cannot cancel a checked-in order" };

  order.status       = "cancelled";
  order.cancelReason = reason;
  order.cancelledAt  = new Date().toISOString();
  order.updatedAt    = order.cancelledAt;
  list[idx] = order;
  persist();
  return order;
}

// ── Exports ───────────────────────────────────────────────────────────────────

module.exports = {
  createAdvanceOrder,
  listAdvanceOrders,
  getAdvanceOrder,
  updateAdvanceOrder,
  checkInAdvanceOrder,
  cancelAdvanceOrder,
};
