const bcrypt  = require("bcrypt");
const crypto  = require("crypto");
const { query } = require("../../db/pool");
const { sendWelcomeEmail } = require("../../utils/email");

/**
 * List all tenants (clients) registered on the platform.
 * Joins users_index → tenant_settings to pull owner + restaurant info.
 * Excludes the "default" tenant (Saisangeet's own account).
 */
async function listClients() {
  const result = await query(`
    SELECT
      ui.identifier  AS email,
      ui.tenant_id   AS "tenantId",
      ui.created_at  AS "signedUpAt",
      ts.value       AS setup,
      ts.updated_at  AS "lastUpdatedAt"
    FROM users_index ui
    LEFT JOIN tenant_settings ts
           ON ts.tenant_id = ui.tenant_id AND ts.key = 'owner_setup'
    WHERE ui.tenant_id != 'default'
    ORDER BY ui.created_at DESC
  `);

  return result.rows.map((row) => {
    let setup = {};
    try { setup = typeof row.setup === "string" ? JSON.parse(row.setup) : (row.setup || {}); } catch (_) {}

    const owner = (setup.users || []).find((u) => (u.roles || []).includes("Owner")) || {};
    const bp    = setup.businessProfile || {};

    return {
      tenantId:       row.tenantId,
      email:          row.email,
      ownerName:      owner.fullName || owner.name || "—",
      restaurantName: bp.tradeName || bp.legalName || "—",
      phone:          owner.phone || bp.phone || "—",
      signedUpAt:     row.signedUpAt,
      lastUpdatedAt:  row.lastUpdatedAt,
      hasPassword:    !!owner.passwordHash
    };
  });
}

/**
 * Reset a client's password by tenantId.
 * Generates a new temp password, updates it in tenant_settings,
 * and re-sends the welcome email so the client can log back in.
 */
async function resetClientPassword(tenantId) {
  const result = await query(
    `SELECT value FROM tenant_settings WHERE tenant_id = $1 AND key = 'owner_setup'`,
    [tenantId]
  );

  if (!result.rows[0]) {
    throw new Error("Tenant not found");
  }

  let setup = {};
  try {
    setup = typeof result.rows[0].value === "string"
      ? JSON.parse(result.rows[0].value)
      : (result.rows[0].value || {});
  } catch (_) {}

  const ownerIndex = (setup.users || []).findIndex((u) => (u.roles || []).includes("Owner"));
  if (ownerIndex < 0) throw new Error("Owner user not found for this tenant");

  const tempPassword = "Dine@" + crypto.randomInt(1000, 9999);
  const passwordHash = await bcrypt.hash(tempPassword, 10);

  setup.users[ownerIndex] = { ...setup.users[ownerIndex], passwordHash };

  await query(
    `UPDATE tenant_settings SET value = $1, updated_at = NOW()
     WHERE tenant_id = $2 AND key = 'owner_setup'`,
    [JSON.stringify(setup), tenantId]
  );

  const owner = setup.users[ownerIndex];
  const bp    = setup.businessProfile || {};

  await sendWelcomeEmail({
    to:           owner.email,
    name:         owner.fullName || owner.name || "there",
    restaurant:   bp.tradeName || bp.legalName || "your restaurant",
    tempPassword
  });

  return { ok: true, email: owner.email, tempPassword };
}

module.exports = { listClients, resetClientPassword };
