const { isDatabaseEnabled } = require("../../db/database-mode");
const { loadRuntimeState, saveRuntimeState } = require("../../db/runtime-state.repository");
const { getState, hydrateState } = require("./operations.memory-store");

const OPERATIONS_SCOPE = "operations";

async function syncOperationsState() {
  if (!isDatabaseEnabled()) {
    return getState();
  }

  const persistedState = await loadRuntimeState(OPERATIONS_SCOPE);

  if (persistedState) {
    return hydrateState(persistedState);
  }

  const currentState = getState();
  await saveRuntimeState(OPERATIONS_SCOPE, currentState);
  return currentState;
}

async function persistOperationsState() {
  const currentState = getState();

  if (isDatabaseEnabled()) {
    await saveRuntimeState(OPERATIONS_SCOPE, currentState);
  }

  return currentState;
}

module.exports = {
  syncOperationsState,
  persistOperationsState
};
