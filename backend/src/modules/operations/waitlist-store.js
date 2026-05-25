/**
 * waitlist-store.js
 * In-memory + JSON-file store for table waitlist entries.
 * Same pattern as wastage-store.js.
 *
 * Entry shape:
 *   id, tenantId, outletId, outletName,
 *   name, phone, partySize,
 *   joinedAt, status (waiting|seated|no_show|cancelled),
 *   queueNumber, estimatedWait (mins),
 *   assignedTableId, assignedTableLabel, seatedAt
 */
const fs   = require("fs");
const path = require("path");

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "../../../.data");
if (!fs.existsSync(DATA_DIR)) {
  try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch (_) {}
}

// ── Turnover settings store (per tenant+outlet) ───────────────────────────────
// Separate small JSON: { [tenantId:outletId]: { breakfast, lunch, snacks, dinner, periods } }
const SETTINGS_FILE = path.join(DATA_DIR, "waitlist-settings.json");
let settingsCache = null;

function loadSettings() {
  if (settingsCache) return settingsCache;
  try { settingsCache = JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf8")) || {}; }
  catch (_) { settingsCache = {}; }
  return settingsCache;
}

function saveSettings() {
  try { fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settingsCache, null, 2)); } catch (_) {}
}

const DEFAULT_SETTINGS = {
  breakfast: 20,   // mins avg turnover
  lunch:     30,
  snacks:    25,
  dinner:    45,
  // time ranges (24h HH:MM)
  breakfastStart: "07:00", breakfastEnd: "11:00",
  lunchStart:     "11:00", lunchEnd:     "15:00",
  snacksStart:    "15:00", snacksEnd:    "18:00",
  dinnerStart:    "18:00", dinnerEnd:    "23:59",
};

function getSettings(tenantId, outletId) {
  const key = `${tenantId}:${outletId || "default"}`;
  return { ...DEFAULT_SETTINGS, ...(loadSettings()[key] || {}) };
}

function saveOutletSettings(tenantId, outletId, patch) {
  const key = `${tenantId}:${outletId || "default"}`;
  const s = loadSettings();
  s[key] = { ...DEFAULT_SETTINGS, ...(s[key] || {}), ...patch };
  settingsCache = s;
  saveSettings();
  return s[key];
}

// ── Current period + avg turnover ─────────────────────────────────────────────
function timeToMins(hhmm) {
  const [h, m] = (hhmm || "00:00").split(":").map(Number);
  return h * 60 + m;
}

function getCurrentPeriodTurnover(settings) {
  const now = new Date();
  const cur = now.getHours() * 60 + now.getMinutes();
  if (cur >= timeToMins(settings.breakfastStart) && cur < timeToMins(settings.breakfastEnd))
    return { period: "breakfast", turnover: settings.breakfast };
  if (cur >= timeToMins(settings.lunchStart) && cur < timeToMins(settings.lunchEnd))
    return { period: "lunch", turnover: settings.lunch };
  if (cur >= timeToMins(settings.snacksStart) && cur < timeToMins(settings.snacksEnd))
    return { period: "snacks", turnover: settings.snacks };
  return { period: "dinner", turnover: settings.dinner };
}

/**
 * Calculate estimated wait in minutes for a new party.
 * occupiedTables: array of { seats, startedAt (ISO) }
 * waitingAhead:   array of already-waiting entries with partySize
 */
function calcEstimatedWait(partySize, occupiedTables, waitingAhead, settings) {
  const { turnover } = getCurrentPeriodTurnover(settings);

  // Tables that can seat this party
  const eligibleTables = occupiedTables.filter(t => (t.seats || 0) >= partySize);
  if (!eligibleTables.length) return turnover; // no info — return one turnover cycle

  // Parties ahead who also need a same-or-larger table
  const sameNeedAhead = waitingAhead.filter(w => w.partySize >= partySize).length;

  // Effective position: how many table-frees does this party need to wait for
  // Each eligible table frees every `turnover` mins on average
  const freesPerCycle = eligibleTables.length;
  const waitCycles = Math.ceil((sameNeedAhead + 1) / freesPerCycle);
  const mins = waitCycles * turnover;

  // Return as a { min, max } range (+/- 5 mins for display)
  return { mins, min: Math.max(5, mins - 5), max: mins + 10 };
}

// ── Waitlist file store ───────────────────────────────────────────────────────
function waitlistFile(tenantId) {
  return path.join(DATA_DIR, `waitlist-${tenantId || "default"}.json`);
}

const cache = {};

function loadFromDisk(tenantId) {
  if (cache[tenantId]) return cache[tenantId];
  try { cache[tenantId] = JSON.parse(fs.readFileSync(waitlistFile(tenantId), "utf8")) || []; }
  catch (_) { cache[tenantId] = []; }
  return cache[tenantId];
}

function saveToDisk(tenantId) {
  try { fs.writeFileSync(waitlistFile(tenantId), JSON.stringify(cache[tenantId] || [], null, 2)); }
  catch (_) {}
}

// ── Counter per outlet per day ────────────────────────────────────────────────
function nextQueueNumber(tenantId, outletId) {
  const list = loadFromDisk(tenantId);
  const todayStr = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  const todayEntries = list.filter(e =>
    e.outletId === outletId &&
    (e.joinedAt || "").slice(0, 10) === todayStr
  );
  return todayEntries.length + 1;
}

// ── Public API ────────────────────────────────────────────────────────────────

function addToWaitlist(tenantId, entry) {
  const list = loadFromDisk(tenantId);
  const queueNumber = nextQueueNumber(tenantId, entry.outletId);
  const record = {
    id:          `wl-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    tenantId,
    joinedAt:    new Date().toISOString(),
    status:      "waiting",
    queueNumber,
    assignedTableId:    null,
    assignedTableLabel: null,
    seatedAt:    null,
    ...entry,
  };
  list.push(record);
  cache[tenantId] = list;
  saveToDisk(tenantId);
  return record;
}

function getWaitlist(tenantId, outletId) {
  const list = loadFromDisk(tenantId);
  const todayStr = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  return list
    .filter(e =>
      e.outletId === outletId &&
      (e.joinedAt || "").slice(0, 10) === todayStr &&
      e.status === "waiting"
    )
    .sort((a, b) => a.queueNumber - b.queueNumber);
}

function updateWaitlistEntry(tenantId, id, patch) {
  const list = loadFromDisk(tenantId);
  const idx = list.findIndex(e => e.id === id);
  if (idx === -1) return null;
  list[idx] = { ...list[idx], ...patch };
  cache[tenantId] = list;
  saveToDisk(tenantId);
  return list[idx];
}

function getWaitlistHistory(tenantId, outletId, dateFrom, dateTo) {
  const list = loadFromDisk(tenantId);
  return list
    .filter(e => {
      if (outletId && e.outletId !== outletId) return false;
      const d = (e.joinedAt || "").slice(0, 10);
      if (dateFrom && d < dateFrom) return false;
      if (dateTo   && d > dateTo)   return false;
      return true;
    })
    .sort((a, b) => (b.joinedAt || "").localeCompare(a.joinedAt || ""));
}

module.exports = {
  addToWaitlist,
  getWaitlist,
  updateWaitlistEntry,
  getWaitlistHistory,
  getSettings,
  saveOutletSettings,
  calcEstimatedWait,
  getCurrentPeriodTurnover,
};
