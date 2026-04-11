const { query } = require("../../db/pool");

async function listDevices() {
  const result = await query(
    `
      SELECT
        id,
        outlet_id AS "outletId",
        device_type AS "deviceType",
        device_name AS "deviceName",
        platform,
        status,
        last_seen_at AS "lastSeenAt"
      FROM device_registry
      ORDER BY created_at DESC
    `
  );

  return result.rows;
}

module.exports = {
  listDevices
};
