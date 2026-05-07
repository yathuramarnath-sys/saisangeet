const { isDatabaseEnabled } = require("../../db/database-mode");
const { loadRuntimeState, saveRuntimeState } = require("../../db/runtime-state.repository");
const { getState, hydrateState } = require("./operations.memory-store");
const { getCurrentTenantId } = require("../../data/tenant-context");

// Scope key is per-tenant so each restaurant's active order state is stored
// in its own row: "<tenantId>:operations"  (e.g. "default:operations")
function _scope() {
  return `${getCurrentTenantId()}:operations`;
}

async function syncOperationsState() {
  if (!isDatabaseEnabled()) {
    return getState();
  }

  const persistedState = await loadRuntimeState(_scope());

  if (persistedState) {
    return hydrateState(persistedState);
  }

  const currentState = getState();
  await saveRuntimeState(_scope(), currentState);
  return currentState;
}

async function persistOperationsState() {
  const currentState = getState();

  if (isDatabaseEnabled()) {
    await saveRuntimeState(_scope(), currentState);
  }

  return currentState;
}

module.exports = {
  syncOperationsState,
  persistOperationsState
};
