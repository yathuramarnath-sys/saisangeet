/**
 * paytm.service.js
 *
 * Paytm Payment Gateway — Dynamic UPI QR per bill.
 *
 * API doc: https://developer.paytm.com/docs/payment-gateway/
 * Auth: HMAC-SHA256 checksum generated from params + merchantKey
 *
 * Per-outlet credentials stored in ownerSetupData.outlets[].paymentConfig.upi:
 *   { paytmMerchantId, paytmMerchantKey, mode }
 *   mode: "PRODUCTION" | "STAGING"
 */

const crypto = require("crypto");
const https  = require("https");
const QRCode = require("qrcode");

const PROD_BASE    = "https://securegw.paytm.in";
const STAGING_BASE = "https://securegw-stage.paytm.in";

// In-memory map: orderId → { tenantId, outletId, tableId, tableLabel, amount, orderNumber }
const pendingTxns = new Map();

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function baseUrl(mode) {
  return mode === "PRODUCTION" ? PROD_BASE : STAGING_BASE;
}

/**
 * Paytm HMAC-SHA256 checksum.
 * Concatenate all non-empty string values sorted by key, joined with "|", then HMAC with merchant key.
 */
function generateChecksum(params, merchantKey) {
  const sorted = Object.keys(params)
    .sort()
    .map(k => (params[k] !== null && params[k] !== undefined ? String(params[k]) : ""))
    .join("|");
  return crypto.createHmac("sha256", merchantKey).update(sorted).digest("hex");
}

function httpsPost(hostname, path, body, headers) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const opts = {
      hostname, path, method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(payload),
        ...headers,
      },
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

function httpsGet(hostname, path, headers) {
  return new Promise((resolve, reject) => {
    const opts = { hostname, path, method: "GET", headers: { "Content-Type": "application/json", ...headers } };
    const req = https.request(opts, res => {
      let data = "";
      res.on("data", c => { data += c; });
      res.on("end", () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on("error", reject);
    req.end();
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Initiate payment — returns QR data URL + orderId
// ─────────────────────────────────────────────────────────────────────────────

async function initiatePayment(opts, creds, callbackUrl) {
  const { tenantId, outletId, tableId, tableLabel, orderNumber, amount } = opts;
  const { merchantId, merchantKey, mode = "STAGING" } = creds;

  const orderId = `ORD-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`;
  const amountStr = Number(amount).toFixed(2);

  const params = {
    MID:         merchantId,
    ORDER_ID:    orderId,
    TXN_AMOUNT:  amountStr,
    CUST_ID:     `table-${tableId}`,
    CHANNEL_ID:  "WEB",
    WEBSITE:     mode === "PRODUCTION" ? "DEFAULT" : "WEBSTAGING",
    INDUSTRY_TYPE_ID: "Retail",
    CALLBACK_URL: callbackUrl,
  };

  const checksum = generateChecksum(params, merchantKey);
  const base = baseUrl(mode);
  const url  = new URL(`${base}/paymentservices/qrCode/create`);

  const result = await httpsPost(url.hostname, url.pathname, params, {
    mid: merchantId,
    signature: checksum,
  });

  if (result.body?.resultInfo?.resultStatus !== "S") {
    throw new Error(
      `Paytm initiate failed: ${result.body?.resultInfo?.resultMsg || "Unknown error"}`
    );
  }

  const qrData = result.body?.qrData;
  if (!qrData) throw new Error("Paytm did not return QR data");

  // qrData is a UPI string (upi://pay?...) — render as QR image
  const qrDataUrl = await QRCode.toDataURL(qrData, {
    width:  300,
    margin: 2,
    color:  { dark: "#00B9F1", light: "#ffffff" }, // Paytm blue
    errorCorrectionLevel: "M",
  });

  pendingTxns.set(orderId, {
    tenantId, outletId, tableId, tableLabel,
    orderNumber, amount,
    initiatedAt: new Date().toISOString(),
  });

  setTimeout(() => pendingTxns.delete(orderId), 15 * 60 * 1000);

  console.log(`[paytm] initiated | orderId=${orderId} | table=${tableLabel} | ₹${amount}`);

  return {
    orderId,
    amount,
    tableLabel,
    qrDataUrl,
    qrData,
    expiresInSecs: 900,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Verify webhook signature from Paytm
// ─────────────────────────────────────────────────────────────────────────────

function verifyWebhookSignature(body, merchantKey) {
  const { CHECKSUMHASH, ...params } = body;
  if (!CHECKSUMHASH) throw new Error("No CHECKSUMHASH in webhook body");

  const expected = generateChecksum(params, merchantKey);
  if (expected !== CHECKSUMHASH) throw new Error("Webhook signature mismatch");
  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// Check payment status
// ─────────────────────────────────────────────────────────────────────────────

async function checkStatus(orderId, creds) {
  const { merchantId, merchantKey, mode = "STAGING" } = creds;
  const params    = { MID: merchantId, ORDER_ID: orderId };
  const checksum  = generateChecksum(params, merchantKey);
  const base      = baseUrl(mode);
  const url       = new URL(`${base}/order/status`);

  const result = await httpsPost(url.hostname, url.pathname, { ...params, CHECKSUMHASH: checksum }, {});
  return result.body;
}

module.exports = { initiatePayment, verifyWebhookSignature, checkStatus, pendingTxns };
