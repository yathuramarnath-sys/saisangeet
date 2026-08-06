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

async function registerDevice({ tenantId, outletId, deviceType, deviceName, platform, fingerprint }) {
  const effectiveOutletId = outletId || "";
  const effectiveType     = deviceType || "pos";
  const effectivePlatform = platform   || null;

  // ── Layer 2: deduplication by (tenant, outlet, type, platform) ───────────
  // If a device with the same identity was seen in the last 30 days, return
  // that existing row instead of creating a new one. This prevents a new row
  // every time a user clears their browser cache or reinstalls the web app.
  if (!fingerprint) {
    const existing = await query(
      `SELECT id, tenant_id AS "tenantId", outlet_id AS "outletId",
              device_type AS "deviceType", device_name AS "deviceName",
              platform, status, last_seen_at AS "lastSeenAt"
       FROM device_registry
       WHERE tenant_id = $1
         AND outlet_id = $2
         AND device_type = $3
         AND (platform = $4 OR ($4 IS NULL AND platform IS NULL))
         AND last_seen_at > NOW() - INTERVAL '30 days'
       ORDER BY last_seen_at DESC
       LIMIT 1`,
      [tenantId, effectiveOutletId, effectiveType, effectivePlatform]
    );
    if (existing.rows.length > 0) {
      // Refresh last_seen_at and return the existing device
      await query(
        `UPDATE device_registry SET last_seen_at = NOW(),
                device_name = COALESCE($2, device_name)
         WHERE id = $1`,
        [existing.rows[0].id, deviceName || null]
      );
      return existing.rows[0];
    }
  }

  // ── Layer 3a: Electron hardware fingerprint ───────────────────────────────
  // Electron sends a stable ID derived from the userData folder. Use it as
  // the row PK so reinstalling the .exe never creates a duplicate row.
  const id = fingerprint || `device-${crypto.randomBytes(6).toString("hex")}`;

  const result = await query(
    `INSERT INTO device_registry
       (id, tenant_id, outlet_id, device_type, device_name, platform, last_seen_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW())
     ON CONFLICT (id) DO UPDATE
       SET last_seen_at  = NOW(),
           outlet_id     = EXCLUDED.outlet_id,
           device_name   = COALESCE(EXCLUDED.device_name, device_registry.device_name)
     RETURNING
       id,
       tenant_id   AS "tenantId",
       outlet_id   AS "outletId",
       device_type AS "deviceType",
       device_name AS "deviceName",
       platform,
       status,
       last_seen_at AS "lastSeenAt"`,
    [id, tenantId, effectiveOutletId, effectiveType, deviceName || null, effectivePlatform]
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
