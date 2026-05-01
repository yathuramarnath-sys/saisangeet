/**
 * counter.service.js
 * Sequential bill number + KOT number generator.
 *
 * Bill numbers:
 *   Mode "fy"    — continuous from Apr 1 → Mar 31, resets on new financial year.
 *                  Default mode. Suitable for GST compliance.
 *   Mode "daily" — resets to 1 every day at midnight IST.
 *
 * KOT numbers:
 *   Always daily reset (resets to 1 every day). Includes IST timestamp.
 *
 * Thread-safety:
 *   Node.js is single-threaded — in-memory increments are atomic.
 *   Counters are persisted to tenant JSON asynchronously after each use.
 *   Worst-case on crash: one number reused. Acceptable for restaurant POS.
 *
 * Storage:
 *   Tenant JSON → counterConfig:
 *   {
 *     billMode:   "fy",                          // "fy" | "daily"
 *     fyBill:     { fy: "2024-25", last: 0 },    // FY mode counter
 *     dailyBill:  { date: "2025-05-01", last: 0 }, // daily mode counter
 *     kot:        { date: "2025-05-01", last: 0 }  // always daily
 *   }
 */

const {
  getOwnerSetupData,
  updateOwnerSetupData,
} = require("../../data/owner-setup-store");
const { runWithTenant } = require("../../data/tenant-context");

// ── In-memory cache: tenantId → counterConfig object ─────────────────────────
const _cache = new Map();

// ── Date helpers ──────────────────────────────────────────────────────────────

/** Returns today's date in IST as "YYYY-MM-DD" */
function todayIST() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

/** Returns current Indian Financial Year as "YYYY-YY" e.g. "2024-25" */
function currentFY() {
  const now   = new Date();
  const year  = now.getFullYear();
  const month = now.getMonth() + 1; // 1-based
  // FY starts Apr 1
  if (month >= 4) return `${year}-${String(year + 1).slice(-2)}`;
  return `${year - 1}-${String(year).slice(-2)}`;
}

/** Returns current IST time as "HH:MM" */
function nowIST() {
  return new Date().toLocaleTimeString("en-IN", {
    timeZone: "Asia/Kolkata",
    hour:     "2-digit",
    minute:   "2-digit",
    hour12:   false,
  });
}

// ── Cache helpers ─────────────────────────────────────────────────────────────

function _defaultConfig() {
  return {
    billMode:  "fy",
    fyBill:    { fy: currentFY(), last: 0 },
    dailyBill: { date: todayIST(), last: 0 },
    kot:       { date: todayIST(), last: 0 },
  };
}

function _loadConfig(tenantId) {
  if (_cache.has(tenantId)) return _cache.get(tenantId);
  let cfg;
  runWithTenant(tenantId, () => {
    const data = getOwnerSetupData();
    cfg = data.counterConfig
      ? { ..._defaultConfig(), ...data.counterConfig }
      : _defaultConfig();
  });
  _cache.set(tenantId, cfg);
  return cfg;
}

function _saveConfig(tenantId) {
  const cfg = _cache.get(tenantId);
  if (!cfg) return;
  // Fire-and-forget async persist
  runWithTenant(tenantId, () => {
    updateOwnerSetupData((data) => ({ ...data, counterConfig: cfg }));
  });
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Get the next sequential bill number for this tenant.
 * Atomic in-memory increment, async persist.
 * @returns {{ billNo: number, mode: string, fy?: string, date?: string }}
 */
function getNextBillNo(tenantId) {
  const cfg  = _loadConfig(tenantId);
  const mode = cfg.billMode || "fy";
  let billNo;

  if (mode === "fy") {
    const fy = currentFY();
    // Reset on new financial year
    if (!cfg.fyBill || cfg.fyBill.fy !== fy) {
      cfg.fyBill = { fy, last: 0 };
    }
    cfg.fyBill.last += 1;
    billNo = cfg.fyBill.last;
  } else {
    const today = todayIST();
    // Reset on new day
    if (!cfg.dailyBill || cfg.dailyBill.date !== today) {
      cfg.dailyBill = { date: today, last: 0 };
    }
    cfg.dailyBill.last += 1;
    billNo = cfg.dailyBill.last;
  }

  _saveConfig(tenantId);
  return { billNo, mode, fy: cfg.fyBill?.fy, date: todayIST() };
}

/**
 * Get the next sequential KOT number for this tenant (always daily reset).
 * @returns {{ kotNo: number, time: string, date: string }}
 */
function getNextKotNo(tenantId) {
  const cfg   = _loadConfig(tenantId);
  const today = todayIST();

  // Reset on new day
  if (!cfg.kot || cfg.kot.date !== today) {
    cfg.kot = { date: today, last: 0 };
  }
  cfg.kot.last += 1;
  const kotNo = cfg.kot.last;

  _saveConfig(tenantId);
  return { kotNo, time: nowIST(), date: today };
}

/**
 * Get current counter config (for owner settings page).
 */
function getCounterConfig(tenantId) {
  const cfg = _loadConfig(tenantId);
  return {
    billMode:       cfg.billMode || "fy",
    currentFY:      currentFY(),
    fyBillLast:     cfg.fyBill?.last    || 0,
    fyBillFY:       cfg.fyBill?.fy      || currentFY(),
    dailyBillLast:  cfg.dailyBill?.last || 0,
    dailyBillDate:  cfg.dailyBill?.date || todayIST(),
    kotLast:        cfg.kot?.last       || 0,
    kotDate:        cfg.kot?.date       || todayIST(),
    todayIST:       todayIST(),
  };
}

/**
 * Update counter settings (owner can switch mode).
 * @param {"fy"|"daily"} billMode
 */
function updateCounterConfig(tenantId, { billMode }) {
  const cfg = _loadConfig(tenantId);
  if (billMode && ["fy", "daily"].includes(billMode)) {
    cfg.billMode = billMode;
  }
  _saveConfig(tenantId);
  return getCounterConfig(tenantId);
}

/**
 * Reset bill counter (owner action with explicit confirmation).
 * Resets the currently-active counter to 0.
 */
function resetBillCounter(tenantId) {
  const cfg   = _loadConfig(tenantId);
  const mode  = cfg.billMode || "fy";
  if (mode === "fy") {
    cfg.fyBill = { fy: currentFY(), last: 0 };
  } else {
    cfg.dailyBill = { date: todayIST(), last: 0 };
  }
  _saveConfig(tenantId);
  return getCounterConfig(tenantId);
}

module.exports = {
  getNextBillNo,
  getNextKotNo,
  getCounterConfig,
  updateCounterConfig,
  resetBillCounter,
};
