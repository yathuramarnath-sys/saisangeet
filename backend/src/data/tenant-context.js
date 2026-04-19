/**
 * Tenant context using AsyncLocalStorage.
 * Every incoming request sets a tenantId — all data reads/writes in that
 * request automatically use the correct tenant's file, with zero changes
 * needed in any service or route handler.
 */
const { AsyncLocalStorage } = require("async_hooks");

const storage = new AsyncLocalStorage();

function runWithTenant(tenantId, fn) {
  return storage.run({ tenantId }, fn);
}

function getCurrentTenantId() {
  return storage.getStore()?.tenantId || "default";
}

module.exports = { runWithTenant, getCurrentTenantId };
