const { Resend } = require("resend");
const { env } = require("../config/env");

let _resend = null;

function getResend() {
  if (!_resend) {
    _resend = new Resend(env.resendApiKey);
  }
  return _resend;
}

/**
 * Send a welcome email with login credentials after enrollment.
 */
async function sendWelcomeEmail({ to, name, restaurant, tempPassword }) {
  if (!env.resendApiKey) {
    console.log(`[email] RESEND_API_KEY not configured. Skipping email to ${to}`);
    console.log(`[email] credentials → email: ${to}  password: ${tempPassword}`);
    return;
  }

  const loginUrl = `${env.appUrl}/login`;

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>
    body { font-family: 'Segoe UI', Arial, sans-serif; background: #f4f4f7; margin: 0; padding: 0; }
    .wrap { max-width: 540px; margin: 40px auto; background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 16px rgba(0,0,0,.08); }
    .header { background: #FF5A1F; padding: 32px 40px; }
    .header h1 { color: #fff; margin: 0; font-size: 22px; font-weight: 800; letter-spacing: -.5px; }
    .header p { color: rgba(255,255,255,.8); margin: 4px 0 0; font-size: 14px; }
    .body { padding: 36px 40px; }
    .body h2 { font-size: 20px; font-weight: 700; color: #1A1D27; margin: 0 0 8px; }
    .body p { color: #4A5065; font-size: 15px; line-height: 1.65; margin: 0 0 20px; }
    .creds { background: #F7F8FA; border: 1.5px solid #E8EAF0; border-radius: 10px; padding: 20px 24px; margin: 0 0 24px; }
    .creds p { margin: 0 0 10px; font-size: 14px; color: #4A5065; }
    .creds p:last-child { margin: 0; }
    .creds strong { color: #1A1D27; font-size: 15px; }
    .btn { display: inline-block; background: #FF5A1F; color: #fff; text-decoration: none; font-weight: 700; font-size: 15px; padding: 13px 28px; border-radius: 8px; }
    .note { font-size: 13px !important; color: #8A91A8 !important; }
    .footer { padding: 20px 40px; background: #F7F8FA; border-top: 1px solid #E8EAF0; }
    .footer p { font-size: 12px; color: #8A91A8; margin: 0; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="header">
      <h1>DineXPOS</h1>
      <p>Restaurant OS for India</p>
    </div>
    <div class="body">
      <h2>Welcome, ${name}! 🎉</h2>
      <p>
        Your DineXPOS account for <strong>${restaurant}</strong> is ready.
        Use the credentials below to sign in. Please change your password after your first login.
      </p>
      <div class="creds">
        <p>🔗 <strong>Login URL:</strong><br/><a href="${loginUrl}" style="color:#FF5A1F;">${loginUrl}</a></p>
        <p>👤 <strong>Username (Email):</strong><br/><strong>${to}</strong></p>
        <p>🔑 <strong>Temporary Password:</strong><br/><strong>${tempPassword}</strong></p>
      </div>
      <a href="${loginUrl}" class="btn">Sign In to DineXPOS →</a>
      <p class="note" style="margin-top:24px;">
        Questions? Write to <a href="mailto:info@dinexpos.in" style="color:#FF5A1F;">info@dinexpos.in</a> — we're happy to help.
      </p>
    </div>
    <div class="footer">
      <p>© 2026 DineXPOS · Made in India 🇮🇳 · You received this because you enrolled at dinexpos.in</p>
    </div>
  </div>
</body>
</html>
  `.trim();

  const text = [
    `Welcome to DineXPOS, ${name}!`,
    ``,
    `Your DineXPOS account for ${restaurant} is ready.`,
    ``,
    `Login URL: ${loginUrl}`,
    `Username (email): ${to}`,
    `Temporary password: ${tempPassword}`,
    ``,
    `Please change your password after your first login.`,
    `Questions? Write to info@dinexpos.in`,
  ].join("\n");

  const { error } = await getResend().emails.send({
    from: env.emailFrom,
    to,
    subject: `Welcome to DineXPOS — your ${restaurant} account is ready`,
    html,
    text
  });

  if (error) {
    throw new Error(error.message || "Resend email failed");
  }
}

/**
 * Send a password-reset email with a time-limited link.
 */
async function sendPasswordResetEmail({ to, name, resetUrl }) {
  if (!env.resendApiKey) {
    console.log(`[email] RESEND_API_KEY not configured. Skipping reset email to ${to}`);
    console.log(`[email] reset link → ${resetUrl}`);
    return;
  }

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>
    body { font-family: 'Segoe UI', Arial, sans-serif; background: #f4f4f7; margin: 0; padding: 0; }
    .wrap { max-width: 540px; margin: 40px auto; background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 16px rgba(0,0,0,.08); }
    .header { background: #FF5A1F; padding: 32px 40px; }
    .header h1 { color: #fff; margin: 0; font-size: 22px; font-weight: 800; letter-spacing: -.5px; }
    .header p { color: rgba(255,255,255,.8); margin: 4px 0 0; font-size: 14px; }
    .body { padding: 36px 40px; }
    .body h2 { font-size: 20px; font-weight: 700; color: #1A1D27; margin: 0 0 8px; }
    .body p { color: #4A5065; font-size: 15px; line-height: 1.65; margin: 0 0 20px; }
    .btn { display: inline-block; background: #FF5A1F; color: #fff; text-decoration: none; font-weight: 700; font-size: 15px; padding: 13px 28px; border-radius: 8px; }
    .link-box { background: #F7F8FA; border: 1.5px solid #E8EAF0; border-radius: 8px; padding: 14px 18px; word-break: break-all; font-size: 13px; color: #4A5065; margin: 0 0 24px; }
    .note { font-size: 13px !important; color: #8A91A8 !important; }
    .footer { padding: 20px 40px; background: #F7F8FA; border-top: 1px solid #E8EAF0; }
    .footer p { font-size: 12px; color: #8A91A8; margin: 0; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="header">
      <h1>DineXPOS</h1>
      <p>Restaurant OS for India</p>
    </div>
    <div class="body">
      <h2>Reset your password</h2>
      <p>Hi ${name || "there"},<br/>We received a request to reset your DineXPOS password. Click the button below — this link expires in <strong>1 hour</strong>.</p>
      <a href="${resetUrl}" class="btn">Reset Password →</a>
      <p class="note" style="margin-top:24px;">
        If the button doesn't work, copy and paste this link into your browser:<br/>
        <span class="link-box">${resetUrl}</span>
      </p>
      <p class="note">
        Didn't request a password reset? You can safely ignore this email — your password won't change.
      </p>
    </div>
    <div class="footer">
      <p>© 2026 DineXPOS · Made in India 🇮🇳 · This link expires in 1 hour.</p>
    </div>
  </div>
</body>
</html>
  `.trim();

  const text = [
    `Hi ${name || "there"},`,
    ``,
    `We received a request to reset your DineXPOS password. This link expires in 1 hour:`,
    resetUrl,
    ``,
    `Didn't request this? You can safely ignore this email — your password won't change.`,
  ].join("\n");

  const { error } = await getResend().emails.send({
    from: env.emailFrom,
    to,
    subject: "Reset your DineXPOS password",
    html,
    text
  });

  if (error) {
    throw new Error(error.message || "Resend email failed");
  }
}

/**
 * Notify the owner (BACKUP_EMAIL) that a new signup/demo lead came in.
 */
async function sendNewLeadNotification({ name, restaurant, phone, email, outlets, message }) {
  if (!env.backupEmail) {
    console.log(`[email] BACKUP_EMAIL not configured. Skipping new-lead notification for ${restaurant} (${email})`);
    return;
  }
  if (!env.resendApiKey) {
    console.log(`[email] RESEND_API_KEY not configured. Skipping new-lead notification for ${restaurant} (${email})`);
    return;
  }

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8" /></head>
<body style="font-family:'Segoe UI',Arial,sans-serif;background:#f4f4f7;margin:0;padding:0;">
  <div style="max-width:540px;margin:40px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 16px rgba(0,0,0,.08);">
    <div style="background:#FF5A1F;padding:24px 32px;">
      <h1 style="color:#fff;margin:0;font-size:18px;font-weight:800;">New DineXPOS Signup</h1>
    </div>
    <div style="padding:28px 32px;">
      <table style="width:100%;font-size:14px;color:#1A1D27;border-collapse:collapse;">
        <tr><td style="padding:6px 0;color:#8A91A8;">Name</td><td style="padding:6px 0;font-weight:600;">${name}</td></tr>
        <tr><td style="padding:6px 0;color:#8A91A8;">Restaurant</td><td style="padding:6px 0;font-weight:600;">${restaurant}</td></tr>
        <tr><td style="padding:6px 0;color:#8A91A8;">Phone</td><td style="padding:6px 0;font-weight:600;">${phone}</td></tr>
        <tr><td style="padding:6px 0;color:#8A91A8;">Email</td><td style="padding:6px 0;font-weight:600;">${email}</td></tr>
        <tr><td style="padding:6px 0;color:#8A91A8;">Outlets</td><td style="padding:6px 0;font-weight:600;">${outlets || "-"}</td></tr>
        ${message ? `<tr><td style="padding:6px 0;color:#8A91A8;">Message</td><td style="padding:6px 0;font-weight:600;">${message}</td></tr>` : ""}
      </table>
    </div>
  </div>
</body>
</html>
  `.trim();

  const { error } = await getResend().emails.send({
    from: env.emailFrom,
    to: env.backupEmail,
    subject: `New signup — ${restaurant}`,
    html
  });

  if (error) {
    throw new Error(error.message || "Resend email failed");
  }
}

module.exports = { sendWelcomeEmail, sendPasswordResetEmail, sendNewLeadNotification };
