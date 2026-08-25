/**
 * plan-limits.js
 * Free tier usage limits enforced on trial / unpaid accounts.
 * Paid accounts (status === "active") have no limits.
 */

const { query } = require("../../db/pool");
const { getCurrentTenantId } = require("../../data/tenant-context");
const { getOwnerSetupData } = require("../../data/owner-setup-store");

const FREE_LIMITS = {
  dailyBills:  250,
  menuItems:   100,
  categories:  10,
};

// Accounts created before this date are grandfathered — no limits applied.
// All existing accounts as of 2026-08-25 are exempt.
const LIMITS_ENFORCED_FROM = new Date("2026-08-26T00:00:00.000Z");

// Returns true if this tenant is exempt from free-tier limits
// (paid subscription OR grandfathered account created before enforcement date).
async function isPaidOrGrandfathered(tenantId) {
  try {
    const result = await query(
      "SELECT status, created_at FROM billing WHERE tenant_id = $1 ORDER BY created_at ASC LIMIT 1",
      [tenantId]
    );
    if (!result.rows.length) return false;
    const row = result.rows[0];
    // Active paid plan — no limits
    if (row.status === "active") return true;
    // Account existed before enforcement date — grandfathered
    if (row.created_at && new Date(row.created_at) < LIMITS_ENFORCED_FROM) return true;
    return false;
  } catch {
    return true; // on DB error, don't block operations
  }
}

// Check daily bill limit. Returns { allowed: bool, count: number, limit: number }.
async function checkDailyBillLimit(tenantId) {
  const paid = await isPaidOrGrandfathered(tenantId);
  if (paid) return { allowed: true };

  try {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    // Count closed orders for this tenant today
    // closed_orders is stored in app_runtime_state as JSON by operations module
    // Fall back to in-memory store via require
    const cosModule = require("../operations/closed-orders-store");
    const todaySales = cosModule.getTodaySales(tenantId);
    const count = Array.isArray(todaySales) ? todaySales.length : 0;

    return {
      allowed: count < FREE_LIMITS.dailyBills,
      count,
      limit: FREE_LIMITS.dailyBills,
    };
  } catch {
    return { allowed: true }; // on error, don't block operations
  }
}

// Check menu item limit. Returns { allowed: bool, count: number, limit: number }.
async function checkMenuItemLimit(tenantId) {
  const paid = await isPaidOrGrandfathered(tenantId);
  if (paid) return { allowed: true };

  try {
    const data  = getOwnerSetupData();
    const count = (data?.menuItems || []).length;
    return {
      allowed: count < FREE_LIMITS.menuItems,
      count,
      limit: FREE_LIMITS.menuItems,
    };
  } catch {
    return { allowed: true };
  }
}

// Check category limit. Returns { allowed: bool, count: number, limit: number }.
async function checkCategoryLimit(tenantId) {
  const paid = await isPaidOrGrandfathered(tenantId);
  if (paid) return { allowed: true };

  try {
    const data  = getOwnerSetupData();
    const count = (data?.categories || []).length;
    return {
      allowed: count < FREE_LIMITS.categories,
      count,
      limit: FREE_LIMITS.categories,
    };
  } catch {
    return { allowed: true };
  }
}

module.exports = {
  FREE_LIMITS,
  isPaidOrGrandfathered,
  checkDailyBillLimit,
  checkMenuItemLimit,
  checkCategoryLimit,
};
