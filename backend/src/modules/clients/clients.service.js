const bcrypt  = require("bcrypt");
const crypto  = require("crypto");
const { query } = require("../../db/pool");
const { sendWelcomeEmail } = require("../../utils/email");
const { warmTenantCache } = require("../../data/owner-setup-store");
const { Resend } = require("resend");
const { env } = require("../../config/env");

/**
 * List all tenants (clients) registered on the platform.
 * Joins users_index → tenant_settings to pull owner + restaurant info.
 * Excludes the "default" tenant (Saisangeet's own account).
 */
async function listClients() {
  let result;
  try {
    result = await query(`
      SELECT DISTINCT ON (ui.tenant_id)
        ui.identifier  AS identifier,
        ui.tenant_id   AS "tenantId",
        ui.created_at  AS "signedUpAt",
        ts.value       AS setup,
        ts.updated_at  AS "lastUpdatedAt",
        ca.value       AS client_active,
        tb.plan_id     AS "planId",
        tb.status      AS "billingStatus",
        tb.trial_ends_at AS "trialEndsAt",
        (SELECT MAX(al.created_at) FROM action_logs al WHERE al.tenant_id = ui.tenant_id) AS "lastActivityAt"
      FROM users_index ui
      LEFT JOIN tenant_settings ts
             ON ts.tenant_id = ui.tenant_id AND ts.key = 'owner_setup'
      LEFT JOIN tenant_settings ca
             ON ca.tenant_id = ui.tenant_id AND ca.key = 'client_active'
      LEFT JOIN tenant_billing tb
             ON tb.tenant_id = ui.tenant_id
      WHERE ui.tenant_id != 'default'
      ORDER BY ui.tenant_id, (ui.identifier LIKE '%@%') DESC, ui.created_at ASC
    `);
  } catch (err) {
    // action_logs or tenant_billing may not exist yet — fall back to base query
    if (!err.message?.includes("does not exist")) throw err;
    result = await query(`
      SELECT DISTINCT ON (ui.tenant_id)
        ui.identifier  AS identifier,
        ui.tenant_id   AS "tenantId",
        ui.created_at  AS "signedUpAt",
        ts.value       AS setup,
        ts.updated_at  AS "lastUpdatedAt",
        ca.value       AS client_active,
        NULL           AS "planId",
        NULL           AS "billingStatus",
        NULL           AS "trialEndsAt",
        NULL           AS "lastActivityAt"
      FROM users_index ui
      LEFT JOIN tenant_settings ts
             ON ts.tenant_id = ui.tenant_id AND ts.key = 'owner_setup'
      LEFT JOIN tenant_settings ca
             ON ca.tenant_id = ui.tenant_id AND ca.key = 'client_active'
      WHERE ui.tenant_id != 'default'
      ORDER BY ui.tenant_id, (ui.identifier LIKE '%@%') DESC, ui.created_at ASC
    `);
  }

  const now = Date.now();
  return result.rows.map((row) => {
    let setup = {};
    try { setup = typeof row.setup === "string" ? JSON.parse(row.setup) : (row.setup || {}); } catch (_) {}

    let clientActive = row.client_active;
    if (typeof clientActive === "string") {
      try { clientActive = JSON.parse(clientActive); } catch (_) {}
    }
    const isActive = clientActive ? clientActive.active !== false : true;

    const owner = (setup.users || []).find((u) => (u.roles || []).includes("Owner")) || {};
    const bp    = setup.businessProfile || {};

    const email = owner.email ||
      (row.identifier && row.identifier.includes("@") ? row.identifier : "—");
    const phone = owner.phone || bp.phone ||
      (row.identifier && !row.identifier.includes("@") ? row.identifier : "—");

    let trialDaysLeft = null;
    if (row.trialEndsAt && row.billingStatus === "trialing") {
      const diff = new Date(row.trialEndsAt).getTime() - now;
      trialDaysLeft = Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
    }

    return {
      tenantId:        row.tenantId,
      email,
      ownerName:       owner.fullName || owner.name || "—",
      restaurantName:  bp.tradeName || bp.legalName || "—",
      phone,
      signedUpAt:      row.signedUpAt,
      lastUpdatedAt:   row.lastUpdatedAt,
      lastActivityAt:  row.lastActivityAt || null,
      hasPassword:     !!owner.passwordHash,
      isActive,
      planId:          row.planId || "trial",
      billingStatus:   row.billingStatus || "trialing",
      trialEndsAt:     row.trialEndsAt || null,
      trialDaysLeft,
    };
  });
}

/**
 * Mark a client tenant as active or inactive.
 * Stores a 'client_active' key in tenant_settings.
 */
async function setClientActive(tenantId, isActive) {
  await query(
    `INSERT INTO tenant_settings (tenant_id, key, value)
     VALUES ($1, 'client_active', $2)
     ON CONFLICT (tenant_id, key) DO UPDATE SET value = $2, updated_at = NOW()`,
    [tenantId, JSON.stringify({ active: isActive })]
  );
  return { ok: true, isActive };
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

  // Sync in-memory cache so next login attempt uses the new password hash immediately
  warmTenantCache(tenantId, setup);

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

/**
 * Get full details for a single client tenant — used by the admin detail view.
 */
async function getClientDetails(tenantId) {
  const activityFallback = { rows: [{ total_30d: 0, last_activity: null }] };
  const [setupResult, devicesResult, billingResult, activityResult] = await Promise.all([
    query(
      `SELECT value FROM tenant_settings WHERE tenant_id = $1 AND key = 'owner_setup'`,
      [tenantId]
    ),
    query(
      `SELECT
         id,
         outlet_id       AS "outletId",
         device_type     AS "deviceType",
         device_name     AS "deviceName",
         platform,
         status,
         last_seen_at    AS "lastSeenAt",
         logged_in_user  AS "loggedInUser",
         CASE
           WHEN last_seen_at > NOW() - INTERVAL '5 minutes' THEN 'online'
           ELSE 'offline'
         END AS "onlineStatus"
       FROM device_registry
       WHERE tenant_id = $1
       ORDER BY last_seen_at DESC NULLS LAST`,
      [tenantId]
    ),
    query(
      `SELECT plan_id, status, trial_ends_at, current_period_end, created_at
       FROM tenant_billing WHERE tenant_id = $1`,
      [tenantId]
    ).catch(err => err.message?.includes("does not exist") ? { rows: [{}] } : Promise.reject(err)),
    query(
      `SELECT
         COUNT(*)::int AS total_30d,
         MAX(created_at) AS last_activity
       FROM action_logs
       WHERE tenant_id = $1 AND created_at > NOW() - INTERVAL '30 days'`,
      [tenantId]
    ).catch(err => err.message?.includes("does not exist") ? activityFallback : Promise.reject(err)),
  ]);

  let setup = {};
  try {
    const raw = setupResult.rows[0]?.value;
    setup = typeof raw === "string" ? JSON.parse(raw) : (raw || {});
  } catch (_) {}

  const bp    = setup.businessProfile || {};
  const users = setup.users || [];
  const owner = users.find((u) => (u.roles || []).includes("Owner")) || {};

  const outlets = (setup.outlets || []).map((o) => ({
    id:         o.id,
    name:       o.name,
    code:       o.code,
    city:       o.city || null,
    tableCount: (o.tables || []).length,
    isActive:   o.isActive !== false,
  }));

  const billing  = billingResult.rows[0] || {};
  const activity = activityResult.rows[0] || {};
  const now      = Date.now();

  let trialDaysLeft = null;
  if (billing.trial_ends_at && billing.status === "trialing") {
    const diff = new Date(billing.trial_ends_at).getTime() - now;
    trialDaysLeft = Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
  }

  return {
    tenantId,
    restaurantName:  bp.tradeName || bp.legalName || "—",
    ownerName:       owner.fullName || owner.name || "—",
    email:           owner.email || "—",
    phone:           owner.phone || bp.phone || "—",
    gstin:           bp.gstin || null,
    city:            bp.city || null,
    businessType:    bp.businessType || null,
    outlets,
    devices:         devicesResult.rows,
    staffCount:      users.filter((u) => !(u.roles || []).includes("Owner")).length,
    planId:          billing.plan_id || "trial",
    billingStatus:   billing.status || "trialing",
    trialEndsAt:     billing.trial_ends_at || null,
    trialDaysLeft,
    activityLast30d: activity.total_30d || 0,
    lastActivityAt:  activity.last_activity || null,
  };
}

/**
 * Delete a device registration so the device can be re-paired.
 * This is the "clear machine ID" equivalent — the device will need to re-scan its branch QR.
 */
async function unlinkDevice(tenantId, deviceId) {
  const result = await query(
    `DELETE FROM device_registry WHERE id = $1 AND tenant_id = $2 RETURNING id`,
    [deviceId, tenantId]
  );
  if (result.rows.length === 0) {
    throw new Error("Device not found or already unlinked");
  }
  return { ok: true, deviceId };
}

/**
 * Send a custom email from the PLATO admin to a client.
 */
async function sendEmailToClient(tenantId, { subject, body }) {
  if (!subject || !body) throw new Error("Subject and body are required");

  const result = await query(
    `SELECT value FROM tenant_settings WHERE tenant_id = $1 AND key = 'owner_setup'`,
    [tenantId]
  );
  let setup = {};
  try {
    const raw = result.rows[0]?.value;
    setup = typeof raw === "string" ? JSON.parse(raw) : (raw || {});
  } catch (_) {}

  const owner = (setup.users || []).find((u) => (u.roles || []).includes("Owner")) || {};
  const bp    = setup.businessProfile || {};
  const to    = owner.email;
  if (!to) throw new Error("Client email not found");

  if (!env.resendApiKey) throw new Error("Email service not configured");

  const resend = new Resend(env.resendApiKey);
  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8" /></head>
<body style="font-family:'Segoe UI',Arial,sans-serif;background:#f4f4f7;margin:0;padding:0;">
  <div style="max-width:540px;margin:40px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 16px rgba(0,0,0,.08);">
    <div style="background:#FF5F15;padding:24px 32px;">
      <h1 style="color:#fff;margin:0;font-size:18px;font-weight:800;">PLATO</h1>
      <p style="color:rgba(255,255,255,.8);margin:4px 0 0;font-size:13px;">The Restaurant Operating System · dinexpos.in</p>
    </div>
    <div style="padding:28px 32px;">
      <p style="font-size:15px;color:#4A5065;line-height:1.7;white-space:pre-wrap;">${body.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p>
    </div>
    <div style="padding:16px 32px;background:#F7F8FA;border-top:1px solid #E8EAF0;">
      <p style="font-size:12px;color:#8A91A8;margin:0;">© 2026 PLATO by DineXPOS · <a href="mailto:info@dinexpos.in" style="color:#FF5F15;">info@dinexpos.in</a></p>
    </div>
  </div>
</body>
</html>`.trim();

  const { error } = await resend.emails.send({
    from: env.emailFrom,
    to,
    subject,
    html,
    text: body,
  });

  if (error) throw new Error(error.message || "Email send failed");

  return { ok: true, to, restaurantName: bp.tradeName || bp.legalName || tenantId };
}

module.exports = { listClients, resetClientPassword, setClientActive, getClientDetails, unlinkDevice, sendEmailToClient };
