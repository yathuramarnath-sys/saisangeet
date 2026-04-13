const { query } = require("./pool");

async function loadRuntimeState(scope) {
  const result = await query(
    `
      SELECT payload
      FROM app_runtime_state
      WHERE scope = $1
      LIMIT 1
    `,
    [scope]
  );

  return result.rows[0]?.payload || null;
}

async function saveRuntimeState(scope, payload) {
  await query(
    `
      INSERT INTO app_runtime_state (scope, payload, updated_at)
      VALUES ($1, $2::jsonb, NOW())
      ON CONFLICT (scope)
      DO UPDATE SET
        payload = EXCLUDED.payload,
        updated_at = NOW()
    `,
    [scope, JSON.stringify(payload)]
  );

  return payload;
}

module.exports = {
  loadRuntimeState,
  saveRuntimeState
};
