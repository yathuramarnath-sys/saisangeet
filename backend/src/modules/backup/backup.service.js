const { getOwnerSetupData, getAllCachedTenants } = require("../../data/owner-setup-store");
const { getCurrentTenantId, runWithTenant }    = require("../../data/tenant-context");
const { Resend } = require("resend");
const { env }    = require("../../config/env");

// ── Build a full backup snapshot for a single tenant ─────────────────────────
function buildTenantSnapshot(tenantId) {
  let data;
  if (tenantId && tenantId !== getCurrentTenantId()) {
    // Switch context so getOwnerSetupData() returns the right tenant's data
    return new Promise((resolve) =>
      runWithTenant(tenantId, () => resolve(getOwnerSetupData()))
    );
  }
  data = getOwnerSetupData();
  return Promise.resolve(data);
}

// ── Export all tenants as a single JSON backup ────────────────────────────────
async function exportAllData() {
  const snapshot = {};
  const all = getAllCachedTenants();

  if (all.size === 0) {
    // Fallback: at least export the current tenant
    const tenantId = getCurrentTenantId();
    snapshot[tenantId || "default"] = await buildTenantSnapshot(tenantId);
  } else {
    for (const [tid, tdata] of all) {
      snapshot[tid] = tdata;
    }
  }

  return {
    exportedAt:  new Date().toISOString(),
    tenantCount: Object.keys(snapshot).length,
    tenants:     snapshot,
  };
}

// ── Send backup email via Resend ──────────────────────────────────────────────
async function sendBackupEmail({ toEmail, restaurantName, backupJson }) {
  if (!env.resendApiKey) {
    console.warn("[backup] RESEND_API_KEY not set — skipping backup email");
    return;
  }

  const resend    = new Resend(env.resendApiKey);
  const dateStr   = new Date().toLocaleDateString("en-IN", {
    day: "2-digit", month: "short", year: "numeric"
  });
  const sizeKb    = Math.round(Buffer.byteLength(backupJson, "utf8") / 1024);
  const filename  = `plato-backup-${new Date().toISOString().slice(0, 10)}.json`;

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <style>
    body { font-family: 'Segoe UI', Arial, sans-serif; background: #f4f4f7; margin: 0; padding: 0; }
    .wrap { max-width: 520px; margin: 40px auto; background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 16px rgba(0,0,0,.08); }
    .header { background: #059669; padding: 28px 36px; }
    .header h1 { color: #fff; margin: 0; font-size: 20px; font-weight: 800; }
    .header p  { color: rgba(255,255,255,.8); margin: 4px 0 0; font-size: 13px; }
    .body { padding: 32px 36px; }
    .body h2 { font-size: 18px; font-weight: 700; color: #1A1D27; margin: 0 0 12px; }
    .body p  { color: #4A5065; font-size: 14px; line-height: 1.6; margin: 0 0 16px; }
    .info-box { background: #F0FDF4; border: 1.5px solid #A7F3D0; border-radius: 8px; padding: 16px 20px; margin: 0 0 20px; }
    .info-box p { margin: 4px 0; font-size: 13px; color: #065F46; }
    .footer { padding: 16px 36px; background: #F7F8FA; border-top: 1px solid #E8EAF0; }
    .footer p { font-size: 11px; color: #8A91A8; margin: 0; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="header">
      <h1>Plato POS — Data Backup</h1>
      <p>Automated nightly backup · ${dateStr}</p>
    </div>
    <div class="body">
      <h2>Your data backup is attached</h2>
      <p>
        This is your automatic nightly backup for <strong>${restaurantName || "your restaurant"}</strong>.
        The attached JSON file contains your complete setup — menu, outlets, staff, taxes, and settings.
      </p>
      <div class="info-box">
        <p>📅 <strong>Backup date:</strong> ${dateStr}</p>
        <p>📦 <strong>File size:</strong> ${sizeKb} KB</p>
        <p>📄 <strong>File name:</strong> ${filename}</p>
      </div>
      <p style="font-size:13px;color:#8A91A8;">
        Keep this file safe. If your data is ever lost, send this file to
        <a href="mailto:hello@dinexpos.in" style="color:#059669;">hello@dinexpos.in</a>
        and we will restore it for you within hours.
      </p>
    </div>
    <div class="footer">
      <p>© 2026 Plato POS · DinexPOS · Automated backup — no action needed</p>
    </div>
  </div>
</body>
</html>
`.trim();

  const { error } = await resend.emails.send({
    from:    env.emailFrom || "backups@dinexpos.in",
    to:      toEmail,
    subject: `Plato Backup — ${dateStr} · ${restaurantName || "Your Restaurant"}`,
    html,
    attachments: [
      {
        filename,
        content: Buffer.from(backupJson, "utf8").toString("base64"),
      }
    ]
  });

  if (error) {
    throw new Error(`Backup email failed: ${error.message}`);
  }

  console.log(`[backup] Backup email sent to ${toEmail} (${sizeKb} KB)`);
}

// ── Nightly backup runner — called by the cron scheduler ─────────────────────
// Iterates every cached tenant, finds their owner email, sends a backup.
async function runNightlyBackup() {
  console.log("[backup] Starting nightly backup run...");
  const all = getAllCachedTenants();

  if (all.size === 0) {
    console.log("[backup] No tenants in cache — skipping.");
    return;
  }

  let sent = 0;
  let failed = 0;

  for (const [tenantId, data] of all) {
    try {
      const restaurantName = data?.businessProfile?.tradeName || data?.businessProfile?.legalName || "Restaurant";
      // Find the owner account (has passwordHash = web-login account)
      const ownerUser = (data?.users || []).find((u) => u.passwordHash && u.email);
      const toEmail   = ownerUser?.email || data?.businessProfile?.email;

      if (!toEmail) {
        console.warn(`[backup] Tenant ${tenantId}: no email found — skipping`);
        continue;
      }

      // Build snapshot for just this tenant
      const backupData = {
        exportedAt:  new Date().toISOString(),
        tenantCount: 1,
        tenants:     { [tenantId]: data }
      };
      const backupJson = JSON.stringify(backupData, null, 2);

      await sendBackupEmail({ toEmail, restaurantName, backupJson });
      sent++;
    } catch (err) {
      console.error(`[backup] Tenant ${tenantId} backup failed:`, err.message);
      failed++;
    }
  }

  console.log(`[backup] Nightly backup done — sent: ${sent}, failed: ${failed}`);
}

module.exports = {
  exportAllData,
  sendBackupEmail,
  runNightlyBackup,
};
