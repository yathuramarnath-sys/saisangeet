/**
 * phonepe.routes.js
 *
 * PRIVATE (JWT):
 *   POST /payments/phonepe/initiate   — create payment, return QR
 *   GET  /payments/phonepe/status/:txnId — poll payment status
 *   POST /payments/phonepe/config     — save merchant credentials
 *   GET  /payments/phonepe/config     — get credentials status
 *
 * PUBLIC (no JWT):
 *   POST /webhooks/phonepe            — PhonePe payment callback
 */

const express        = require("express");
const { requireAuth }    = require("../../middleware/require-auth");
const { asyncHandler }   = require("../../utils/async-handler");
const { runWithTenant }  = require("../../data/tenant-context");
const {
  getOwnerSetupData,
  updateOwnerSetupData,
} = require("../../data/owner-setup-store");
const {
  initiatePayment,
  handleWebhook,
  checkStatus,
} = require("./phonepe.service");

const phonePeRouter  = express.Router();   // private
const phonePeWebhook = express.Router();   // public

const PUBLIC_API_URL = process.env.PUBLIC_API_URL || "https://api.dinexpos.in";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function getCreds(data) {
  const cfg = data?.phonePe;
  if (!cfg?.enabled || !cfg?.merchantId || !cfg?.saltKey) return null;
  return {
    merchantId: cfg.merchantId,
    saltKey:    cfg.saltKey,
    saltIndex:  cfg.saltIndex || "1",
    mode:       cfg.mode || "UAT",
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC — PhonePe webhook
// POST /webhooks/phonepe
// ─────────────────────────────────────────────────────────────────────────────
phonePeWebhook.post(
  "/phonepe",
  express.raw({ type: "*/*", limit: "256kb" }),
  asyncHandler(async (req, res) => {
    // PhonePe doesn't send tenantId in the callback — we resolve from txnId context
    // The pendingTxns map carries tenantId set during initiate
    const xVerifyHeader = req.headers["x-verify"] || "";

    // We don't know the tenant yet — try to decode without signature check first
    // to get the merchantTransactionId, then look up the tenant's saltKey
    let rawBody = Buffer.isBuffer(req.body) ? req.body.toString("utf8") : String(req.body || "{}");
    let parsed;
    try { parsed = JSON.parse(rawBody); } catch { return res.status(400).send("Invalid body"); }

    const responseBase64 = parsed?.response;
    if (!responseBase64) return res.status(400).send("No response");

    let data;
    try { data = JSON.parse(Buffer.from(responseBase64, "base64").toString("utf8")); }
    catch { return res.status(400).send("Cannot decode response"); }

    const merchantTransactionId = data?.data?.merchantTransactionId;

    // Import pendingTxns to resolve context
    const { pendingTxns } = require("./phonepe.service");
    const txnContext = merchantTransactionId ? pendingTxns.get(merchantTransactionId) : null;

    // Verify signature using tenant's saltKey
    if (txnContext) {
      const tenantData = await runWithTenant(txnContext.tenantId, () => getOwnerSetupData());
      const creds      = getCreds(tenantData);
      if (creds?.saltKey && xVerifyHeader) {
        const { handleWebhook: hw } = require("./phonepe.service");
        try {
          hw(req.body || rawBody, xVerifyHeader, creds.saltKey, creds.saltIndex);
        } catch (err) {
          console.warn("[phonepe webhook] signature mismatch:", err.message);
          return res.status(401).send("Signature mismatch");
        }
      }
    }

    const success = data?.code === "PAYMENT_SUCCESS" || data?.data?.state === "COMPLETED";

    console.log(`[phonepe webhook] txn=${merchantTransactionId} | success=${success} | state=${data?.data?.state}`);

    if (success && txnContext) {
      const { tenantId, outletId, tableId, tableLabel, amount, orderNumber } = txnContext;

      // Emit payment confirmed to POS + Captain App
      const io = req.app.locals.io;
      if (io) {
        io.to(`outlet:${tenantId}:${outletId}`).emit("payment:phonepe:confirmed", {
          tableId,
          tableLabel,
          amount,
          orderNumber,
          merchantTransactionId,
          utr: data?.data?.paymentInstrument?.utr || "",
          confirmedAt: new Date().toISOString(),
        });
      }
    }

    // PhonePe expects HTTP 200 with empty body or { "message": "OK" }
    res.status(200).json({ message: "OK" });
  })
);

// ─────────────────────────────────────────────────────────────────────────────
// PRIVATE — Initiate payment
// POST /payments/phonepe/initiate
// Body: { outletId, tableId, tableLabel, amount, orderNumber }
// ─────────────────────────────────────────────────────────────────────────────
phonePeRouter.post(
  "/initiate",
  requireAuth,
  asyncHandler(async (req, res) => {
    const tenantId = req.user?.tenantId || "default";
    const { outletId, tableId, tableLabel, amount, orderNumber } = req.body;

    if (!outletId || !tableId || !amount) {
      return res.status(400).json({ error: "outletId, tableId and amount are required" });
    }

    const data  = await runWithTenant(tenantId, () => getOwnerSetupData());
    const creds = getCreds(data);

    if (!creds) {
      return res.status(400).json({
        error: "PhonePe not configured. Go to Integrations → PhonePe to add credentials."
      });
    }

    const callbackUrl = `${PUBLIC_API_URL}/webhooks/phonepe`;

    const result = await initiatePayment(
      { tenantId, outletId, tableId, tableLabel, orderNumber, amount },
      creds,
      callbackUrl
    );

    res.json(result);
  })
);

// ─────────────────────────────────────────────────────────────────────────────
// PRIVATE — Poll payment status
// GET /payments/phonepe/status/:txnId
// ─────────────────────────────────────────────────────────────────────────────
phonePeRouter.get(
  "/status/:txnId",
  requireAuth,
  asyncHandler(async (req, res) => {
    const tenantId = req.user?.tenantId || "default";
    const data     = await runWithTenant(tenantId, () => getOwnerSetupData());
    const creds    = getCreds(data);
    if (!creds) return res.status(400).json({ error: "PhonePe not configured" });

    const result = await checkStatus(req.params.txnId, creds);
    const success = result?.code === "PAYMENT_SUCCESS" || result?.data?.state === "COMPLETED";
    res.json({ ...result, resolved: success });
  })
);

// ─────────────────────────────────────────────────────────────────────────────
// PRIVATE — Save credentials
// POST /payments/phonepe/config
// ─────────────────────────────────────────────────────────────────────────────
phonePeRouter.post(
  "/config",
  requireAuth,
  asyncHandler(async (req, res) => {
    const tenantId = req.user?.tenantId || "default";
    const { merchantId, saltKey, saltIndex, mode, enabled } = req.body;

    await runWithTenant(tenantId, () =>
      updateOwnerSetupData(d => ({
        ...d,
        phonePe: {
          merchantId: merchantId ?? d.phonePe?.merchantId ?? "",
          saltKey:    saltKey    ?? d.phonePe?.saltKey    ?? "",
          saltIndex:  saltIndex  ?? d.phonePe?.saltIndex  ?? "1",
          mode:       mode       ?? d.phonePe?.mode       ?? "UAT",
          enabled:    enabled    ?? d.phonePe?.enabled    ?? false,
        },
      }))
    );

    res.json({ ok: true });
  })
);

// ─────────────────────────────────────────────────────────────────────────────
// PRIVATE — Get config status (never return saltKey)
// GET /payments/phonepe/config
// ─────────────────────────────────────────────────────────────────────────────
phonePeRouter.get(
  "/config",
  requireAuth,
  asyncHandler(async (req, res) => {
    const tenantId = req.user?.tenantId || "default";
    const data     = await runWithTenant(tenantId, () => getOwnerSetupData());
    const cfg      = data?.phonePe || {};

    res.json({
      merchantId:  cfg.merchantId || "",
      saltIndex:   cfg.saltIndex  || "1",
      mode:        cfg.mode       || "UAT",
      enabled:     !!cfg.enabled,
      saltKeySet:  !!cfg.saltKey,
      configured:  !!(cfg.merchantId && cfg.saltKey && cfg.enabled),
    });
  })
);

module.exports = { phonePeRouter, phonePeWebhook };
