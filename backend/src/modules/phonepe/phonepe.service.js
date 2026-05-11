/**
 * phonepe.service.js
 *
 * PhonePe Payment Gateway integration.
 *
 * API reference: https://developer.phonepe.com/v1/reference
 * Auth: X-VERIFY = SHA256(base64(payload) + apiEndpoint + saltKey) + "###" + saltIndex
 *
 * Per-tenant credentials stored in ownerSetupData.phonePe:
 *   { merchantId, saltKey, saltIndex, enabled, mode }
 *   mode: "PRODUCTION" | "UAT"
 */

const crypto  = require("crypto");
const https   = require("https");
const QRCode  = require("qrcode");

const PROD_BASE = "https://api.phonepe.com/apis/hermes";
const UAT_BASE  = "https://api-preprod.phonepe.com/apis/pg-sandbox";

// In-memory map: merchantTransactionId → { tenantId, outletId, tableId, amount, orderNumber }
// Used to match the webhook callback back to the correct table
const pendingTxns = new Map();

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function baseUrl(mode) {
  return mode === "PRODUCTION" ? PROD_BASE : UAT_BASE;
}

function xVerify(payloadBase64, endpoint, saltKey, saltIndex) {
  const hash = crypto
    .createHash("sha256")
    .update(payloadBase64 + endpoint + saltKey)
    .digest("hex");
  return `${hash}###${saltIndex}`;
}

function httpsPost(hostname, path, body, headers) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const opts = {
      hostname, path, method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload), ...headers },
    };
    const req = https.request(opts, res => {
      let data = "";
      res.on("data", c => { data += c; });
      res.on("end", () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Initiate payment — returns QR data URL + txnId
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create a PhonePe payment request and return a QR code image (data URL).
 *
 * @param {object} opts
 *   tenantId, outletId, tableId, tableLabel, orderNumber, amount (rupees)
 * @param {object} creds  — { merchantId, saltKey, saltIndex, mode }
 * @param {string} callbackUrl — public URL PhonePe will POST to
 */
async function initiatePayment(opts, creds, callbackUrl) {
  const { tenantId, outletId, tableId, tableLabel, orderNumber, amount } = opts;
  const { merchantId, saltKey, saltIndex, mode = "UAT" } = creds;

  const merchantTransactionId = `MT-${Date.now()}-${Math.random().toString(16).slice(2, 7)}`;
  const amountPaise           = Math.round(amount * 100); // PhonePe uses paise

  const payload = {
    merchantId,
    merchantTransactionId,
    merchantUserId: `table-${tableId}`,
    amount:         amountPaise,
    callbackUrl,
    mobileNumber:   "",   // optional
    paymentInstrument: { type: "PAY_PAGE" },
  };

  const payloadBase64 = Buffer.from(JSON.stringify(payload)).toString("base64");
  const endpoint      = "/pg/v1/pay";
  const verify        = xVerify(payloadBase64, endpoint, saltKey, saltIndex);

  const base   = baseUrl(mode);
  const url    = new URL(base + endpoint);

  const result = await httpsPost(url.hostname, url.pathname, { request: payloadBase64 }, {
    "X-VERIFY":        verify,
    "X-MERCHANT-ID":   merchantId,
  });

  if (!result.body?.success) {
    throw new Error(
      `PhonePe initiate failed: ${result.body?.message || result.body?.code || "Unknown error"}`
    );
  }

  const redirectUrl = result.body?.data?.instrumentResponse?.redirectInfo?.url;
  if (!redirectUrl) throw new Error("PhonePe did not return a redirect URL");

  // Generate QR code as a base64 PNG data URL — client just renders <img src=...>
  const qrDataUrl = await QRCode.toDataURL(redirectUrl, {
    width:          300,
    margin:         2,
    color:          { dark: "#5f259f", light: "#ffffff" },  // PhonePe purple
    errorCorrectionLevel: "M",
  });

  // Store txn context so webhook can resolve which table to clear
  pendingTxns.set(merchantTransactionId, {
    tenantId, outletId, tableId, tableLabel,
    orderNumber, amount,
    initiatedAt: new Date().toISOString(),
  });

  // Auto-expire after 15 minutes (stale QRs)
  setTimeout(() => pendingTxns.delete(merchantTransactionId), 15 * 60 * 1000);

  console.log(`[phonepe] initiated | txn=${merchantTransactionId} | table=${tableLabel} | ₹${amount}`);

  return {
    merchantTransactionId,
    amount,
    tableLabel,
    qrDataUrl,    // base64 PNG — display as <img src={qrDataUrl} />
    redirectUrl,
    expiresInSecs: 900,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Handle webhook callback from PhonePe
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Verify and decode PhonePe webhook.
 * Returns { success, txnContext, data } or throws.
 */
function handleWebhook(rawBody, xVerifyHeader, saltKey, saltIndex) {
  // 1. Verify signature
  const bodyStr   = Buffer.isBuffer(rawBody) ? rawBody.toString("utf8") : String(rawBody);
  let parsed;
  try { parsed = JSON.parse(bodyStr); } catch { throw new Error("Invalid webhook body"); }

  const responseBase64 = parsed.response;
  if (!responseBase64) throw new Error("No response field in webhook body");

  const expected = `${crypto.createHash("sha256").update(responseBase64 + saltKey).digest("hex")}###${saltIndex}`;
  if (xVerifyHeader && xVerifyHeader !== expected) {
    throw new Error("Webhook signature mismatch");
  }

  // 2. Decode payload
  let data;
  try { data = JSON.parse(Buffer.from(responseBase64, "base64").toString("utf8")); }
  catch { throw new Error("Cannot decode webhook response"); }

  const success = data?.code === "PAYMENT_SUCCESS" || data?.data?.state === "COMPLETED";
  const merchantTransactionId = data?.data?.merchantTransactionId;

  // 3. Resolve txn context
  const txnContext = merchantTransactionId ? pendingTxns.get(merchantTransactionId) : null;
  if (success && txnContext) pendingTxns.delete(merchantTransactionId);

  return { success, merchantTransactionId, txnContext, data };
}

// ─────────────────────────────────────────────────────────────────────────────
// Check payment status (polling fallback when webhook is slow)
// ─────────────────────────────────────────────────────────────────────────────

async function checkStatus(merchantTransactionId, creds) {
  const { merchantId, saltKey, saltIndex, mode = "UAT" } = creds;
  const endpoint = `/pg/v1/status/${merchantId}/${merchantTransactionId}`;
  const verify   = xVerify("", endpoint, saltKey, saltIndex);
  const base     = baseUrl(mode);
  const url      = new URL(base + endpoint);

  return new Promise((resolve, reject) => {
    const opts = {
      hostname: url.hostname,
      path:     url.pathname,
      method:   "GET",
      headers: {
        "X-VERIFY":      verify,
        "X-MERCHANT-ID": merchantId,
        "Content-Type":  "application/json",
      },
    };
    const req = https.request(opts, res => {
      let data = "";
      res.on("data", c => { data += c; });
      res.on("end", () => {
        try { resolve(JSON.parse(data)); }
        catch { resolve(data); }
      });
    });
    req.on("error", reject);
    req.end();
  });
}

module.exports = { initiatePayment, handleWebhook, checkStatus, pendingTxns };
