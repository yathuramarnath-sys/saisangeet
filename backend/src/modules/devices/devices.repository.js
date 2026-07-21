const { query } = require("../../db/pool");
const crypto    = require("crypto");

async function listDevicesByTenant(tenantId) {
  const result = await query(
    `SELECT
       id,
       outlet_id       AS "outletId",
       device_type     AS "deviceType",
       device_name     AS "deviceName",
       platform,
       status,
       last_seen_at    AS "lastSeenAt",
       created_at      AS "createdAt",
       logged_in_user  AS "loggedInUser",
       CASE
         WHEN last_seen_at > NOW() - INTERVAL '2 minutes' THEN 'online'
         ELSE 'offline'
       END AS "onlineStatus"
     FROM device_registry
     WHERE tenant_id = $1
     ORDER BY created_at DESC`,
    [tenantId]
  );
  return result.rows;
}

async function registerDevice({ tenantId, outletId, deviceType, deviceName, platform }) {
  const id = `device-${crypto.randomBytes(6).toString("hex")}`;
  const result = await query(
    `INSERT INTO device_registry
       (id, tenant_id, outlet_id, device_type, device_name, platform, last_seen_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW())
     RETURNING
       id,
       tenant_id   AS "tenantId",
       outlet_id   AS "outletId",
       device_type AS "deviceType",
       device_name AS "deviceName",
       platform,
       status,
       last_seen_at AS "lastSeenAt"`,
    [id, tenantId, outletId || "", deviceType || "pos", deviceName || null, platform || null]
  );
  return result.rows[0];
}

async function pingDevice(id, tenantId, loggedInUser) {
  const result = await query(
    `UPDATE device_registry
     SET last_seen_at = NOW(),
         logged_in_user = COALESCE($3, logged_in_user)
     WHERE id = $1 AND tenant_id = $2
     RETURNING id, last_seen_at AS "lastSeenAt"`,
    [id, tenantId, loggedInUser ?? null]
  );
  return result.rows[0] || null;
}

module.exports = { listDevicesByTenant, registerDevice, pingDevice };
