/**
 * sms.service.js
 * Fast2SMS integration for waitlist notifications.
 * Sender: PLATOPOS (registered DLT sender ID)
 *
 * Env vars:
 *   FAST2SMS_API_KEY  — Fast2SMS authorization key
 *   SMS_SENDER_ID     — override sender ID (default: PLATOPOS)
 *   SMS_ENABLED       — set to "false" to disable in dev/staging
 */

const FAST2SMS_URL = "https://www.fast2sms.com/dev/bulkV2";
const SENDER_ID    = process.env.SMS_SENDER_ID || "PLATOPOS";
const ENABLED      = process.env.SMS_ENABLED !== "false";

/**
 * Send a plain transactional SMS via Fast2SMS.
 * phone: 10-digit Indian mobile number (without +91)
 * message: text to send (max 160 chars for single SMS)
 */
async function sendSMS(phone, message) {
  if (!ENABLED) {
    console.log(`[SMS disabled] To: ${phone} | ${message}`);
    return { ok: true, skipped: true };
  }

  const apiKey = process.env.FAST2SMS_API_KEY;
  if (!apiKey) {
    console.warn("[SMS] FAST2SMS_API_KEY not set — skipping");
    return { ok: false, error: "API key not configured" };
  }

  // Strip +91 or country code if present
  const mobile = String(phone).replace(/^\+?91/, "").replace(/\D/g, "").slice(-10);
  if (mobile.length !== 10) {
    console.warn(`[SMS] Invalid phone: ${phone}`);
    return { ok: false, error: "Invalid phone number" };
  }

  try {
    const res = await fetch(FAST2SMS_URL, {
      method: "POST",
      headers: {
        authorization: apiKey,
        "Content-Type": "application/json",
        "cache-control": "no-cache",
      },
      body: JSON.stringify({
        route:     "q",          // Quick SMS route (transactional)
        sender_id: SENDER_ID,
        message,
        language:  "english",
        flash:     0,
        numbers:   mobile,
      }),
    });

    const data = await res.json();
    if (data.return === true) {
      console.log(`[SMS] Sent to ${mobile}: ${message.slice(0, 40)}…`);
      return { ok: true, data };
    } else {
      console.warn(`[SMS] Fast2SMS error: ${JSON.stringify(data)}`);
      return { ok: false, error: data.message || "Send failed" };
    }
  } catch (err) {
    console.warn(`[SMS] Network error: ${err.message}`);
    return { ok: false, error: err.message };
  }
}

// ── Message templates ─────────────────────────────────────────────────────────

function msgJoinQueue({ name, queueNumber, outletName, waitMin, waitMax }) {
  return `Hi ${name}, you're #${queueNumber} in queue at ${outletName}. Est. wait: ${waitMin}-${waitMax} mins. We'll SMS you when your table is ready. - PLATOPOS`;
}

function msgTableReady({ name, outletName, tableLabel }) {
  const table = tableLabel ? ` (${tableLabel})` : "";
  return `Hi ${name}, your table${table} is ready at ${outletName}! Please come to the counter. - PLATOPOS`;
}

function msgCancelled({ name, outletName }) {
  return `Hi ${name}, your waitlist slot at ${outletName} has been released. We hope to see you soon! - PLATOPOS`;
}

module.exports = { sendSMS, msgJoinQueue, msgTableReady, msgCancelled };
