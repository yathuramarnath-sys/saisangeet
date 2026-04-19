const nodemailer = require("nodemailer");
const { env } = require("../config/env");

// Create transporter lazily so missing SMTP config doesn't crash the server on startup
let _transporter = null;

function getTransporter() {
  if (!_transporter) {
    _transporter = nodemailer.createTransport({
      host: env.smtpHost,
      port: env.smtpPort,
      secure: env.smtpPort === 465,
      auth: {
        user: env.smtpUser,
        pass: env.smtpPass
      }
    });
  }
  return _transporter;
}

/**
 * Send a welcome email with login credentials after enrollment.
 */
async function sendWelcomeEmail({ to, name, restaurant, tempPassword }) {
  if (!env.smtpUser || !env.smtpPass) {
    // Email not configured — log to console in dev, skip silently in prod
    console.log(`[email] SMTP not configured. Would have sent welcome email to ${to}`);
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
    .creds p { margin: 0 0 8px; font-size: 14px; color: #4A5065; }
    .creds p:last-child { margin: 0; }
    .creds strong { color: #1A1D27; }
    .btn { display: inline-block; background: #FF5A1F; color: #fff; text-decoration: none; font-weight: 700; font-size: 15px; padding: 13px 28px; border-radius: 8px; }
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
        Here are your login credentials — please change your password after your first login.
      </p>
      <div class="creds">
        <p>📧 <strong>Login URL:</strong> <a href="${loginUrl}">${loginUrl}</a></p>
        <p>👤 <strong>Username:</strong> ${to}</p>
        <p>🔑 <strong>Temporary Password:</strong> <strong>${tempPassword}</strong></p>
      </div>
      <a href="${loginUrl}" class="btn">Sign In to DineXPOS →</a>
      <p style="margin-top:24px; font-size:13px; color:#8A91A8;">
        If you have any questions, reply to this email or write to
        <a href="mailto:hello@dinexpos.in" style="color:#FF5A1F;">hello@dinexpos.in</a>.
      </p>
    </div>
    <div class="footer">
      <p>© 2026 DineXPOS · Made in India 🇮🇳 · You're receiving this because you enrolled at dinexpos.in</p>
    </div>
  </div>
</body>
</html>
  `.trim();

  await getTransporter().sendMail({
    from: env.emailFrom,
    to,
    subject: `Your DineXPOS login credentials — ${restaurant}`,
    html
  });
}

module.exports = { sendWelcomeEmail };
