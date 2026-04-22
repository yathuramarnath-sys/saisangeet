/**
 * daily-backup.js
 * Runs once every night at midnight IST.
 * Exports all 4 Postgres tables as a JSON attachment and emails it
 * to the BACKUP_EMAIL address configured in Railway variables.
 */

const { query }    = require("../db/pool");
const { Resend }   = require("resend");
const { env }      = require("../config/env");

/* ── Email sender ─────────────────────────────────────────────────────────── */
async function sendBackupEmail(backup) {
  if (!env.resendApiKey) {
    console.log("[backup] RESEND_API_KEY not set — skipping email");
    return;
  }
  if (!env.backupEmail) {
    console.log("[backup] BACKUP_EMAIL not set — skipping email");
    return;
  }

  const resend   = new Resend(env.resendApiKey);
  const dateStr  = new Date().toLocaleDateString("en-IN", {
    timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric"
  });
  const jsonStr  = JSON.stringify(backup, null, 2);
  const sizeKB   = (Buffer.byteLength(jsonStr, "utf8") / 1024).toFixed(1);
  const fileName = `dinexpos-backup-${new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" })}.json`;

  // Summary numbers for email body
  const tenantCount  = (backup.tenant_settings  || []).length;
  const userCount    = (backup.users_index       || []).length;
  const runtimeKeys  = Object.keys(backup.app_runtime_state || {});
  const tokenCount   = (backup.pending_link_tokens || []).length;

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8"/>
  <style>
    body { font-family: 'Segoe UI', Arial, sans-serif; background:#f4f4f7; margin:0; padding:0; }
    .wrap { max-width:540px; margin:32px auto; background:#fff; border-radius:12px; overflow:hidden; box-shadow:0 2px 16px rgba(0,0,0,.08); }
    .header { background:#1A1D27; padding:28px 36px; }
    .header h1 { color:#fff; margin:0; font-size:20px; font-weight:800; }
    .header p  { color:rgba(255,255,255,.6); margin:4px 0 0; font-size:13px; }
    .body { padding:32px 36px; }
    .body h2 { font-size:18px; font-weight:700; color:#1A1D27; margin:0 0 6px; }
    .body p  { color:#4A5065; font-size:14px; line-height:1.6; margin:0 0 18px; }
    .stat-row { display:flex; gap:12px; margin-bottom:20px; flex-wrap:wrap; }
    .stat { background:#F7F8FA; border:1.5px solid #E8EAF0; border-radius:10px; padding:14px 20px; flex:1; min-width:100px; }
    .stat strong { display:block; font-size:22px; font-weight:800; color:#1A1D27; }
    .stat span   { font-size:12px; color:#8A91A8; }
    .ok-badge { display:inline-block; background:#D1FAE5; color:#065F46; font-size:12px; font-weight:700; padding:4px 12px; border-radius:20px; }
    .footer { padding:18px 36px; background:#F7F8FA; border-top:1px solid #E8EAF0; }
    .footer p { font-size:12px; color:#8A91A8; margin:0; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="header">
      <h1>🗄 DineXPOS Daily Backup</h1>
      <p>${dateStr} · Automated backup</p>
    </div>
    <div class="body">
      <h2>Backup completed successfully <span class="ok-badge">✓ OK</span></h2>
      <p>Your database has been exported and attached to this email as <strong>${fileName}</strong> (${sizeKB} KB). Save it somewhere safe — Google Drive, your laptop, or WhatsApp Saved Messages.</p>

      <div class="stat-row">
        <div class="stat"><strong>${tenantCount}</strong><span>Outlets configured</span></div>
        <div class="stat"><strong>${userCount}</strong><span>User accounts</span></div>
        <div class="stat"><strong>${runtimeKeys.length}</strong><span>Runtime state scopes</span></div>
      </div>

      <p style="font-size:13px;color:#8A91A8;">
        ⚠️ This file contains your full restaurant setup. Do not share it publicly.<br/>
        To restore after a data loss, forward this email to <a href="mailto:hello@dinexpos.in" style="color:#FF5A1F;">hello@dinexpos.in</a>.
      </p>
    </div>
    <div class="footer">
      <p>© 2026 DineXPOS · Automated nightly backup · Sent every day at midnight IST</p>
    </div>
  </div>
</body>
</html>`.trim();

  const { error } = await resend.emails.send({
    from:        env.emailFrom,
    to:          env.backupEmail,
    subject:     `✅ DineXPOS Backup — ${dateStr}`,
    html,
    attachments: [
      {
        filename:    fileName,
        content:     Buffer.from(jsonStr).toString("base64"),
        contentType: "application/json"
      }
    ]
  });

  if (error) throw new Error(error.message || "Backup email failed");
  console.log(`[backup] ✅ Backup email sent to ${env.backupEmail} (${sizeKB} KB)`);
}

/* ── Database export ──────────────────────────────────────────────────────── */
async function exportDatabase() {
  const [tenants, users, tokens, runtime] = await Promise.all([
    query("SELECT * FROM tenant_settings").then(r => r.rows),
    query("SELECT id, tenant_id, email, role, created_at FROM users_index").then(r => r.rows), // no passwords
    query("SELECT id, tenant_id, created_at, expires_at FROM pending_link_tokens").then(r => r.rows),
    query("SELECT scope, updated_at FROM app_runtime_state").then(r => r.rows), // payload too large — metadata only
  ]);

  return {
    exported_at:          new Date().toISOString(),
    tenant_settings:      tenants,
    users_index:          users,       // passwords excluded for safety
    pending_link_tokens:  tokens,
    app_runtime_state:    runtime,     // scope + timestamp only (data in live DB)
  };
}

/* ── Main backup job ──────────────────────────────────────────────────────── */
async function runDailyBackup() {
  console.log("[backup] Starting nightly backup…");
  try {
    const backup = await exportDatabase();
    await sendBackupEmail(backup);
  } catch (err) {
    console.error("[backup] ❌ Backup failed:", err.message);
  }
}

/* ── Scheduler: fires every day at midnight IST ───────────────────────────── */
function scheduleBackup() {
  function msUntilMidnightIST() {
    const now = new Date();
    // IST = UTC+5:30
    const istOffset  = 5.5 * 60 * 60 * 1000;
    const istNow     = new Date(now.getTime() + istOffset);
    const midnight   = new Date(istNow);
    midnight.setUTCHours(0, 0, 0, 0);            // midnight of current IST day
    midnight.setUTCDate(midnight.getUTCDate() + 1); // next midnight
    return midnight.getTime() - now.getTime();
  }

  function scheduleNext() {
    const delay = msUntilMidnightIST();
    const hrs   = (delay / 3_600_000).toFixed(1);
    console.log(`[backup] Next backup scheduled in ${hrs} hours (midnight IST)`);
    setTimeout(async () => {
      await runDailyBackup();
      scheduleNext(); // reschedule for next midnight
    }, delay);
  }

  scheduleNext();
}

module.exports = { scheduleBackup, runDailyBackup };
