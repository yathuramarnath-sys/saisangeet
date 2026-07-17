/**
 * paytm.routes.js
 *
 * PRIVATE (JWT):
 *   POST /payments/paytm/initiate   — create dynamic QR for a bill
 *   GET  /payments/paytm/status/:orderId — poll payment status
 *   POST /payments/paytm/config     — save outlet Paytm credentials (per-outlet)
 *   GET  /payments/paytm/config     — get outlet credentials status
 *
 * PUBLIC (no JWT):
 *   POST /webhooks/paytm            — Paytm payment callback
 */

const express      = require("express");
const { requireAuth }   = require("../../middleware/require-auth");
const { asyncHandler }  = require("../../utils/async-handler");
const { runWithTenant } = require("../../data/tenant-context");
const { getOwnerSetupData, updateOwnerSetupData } = require("../../data/owner-setup-store");
const {
  initiatePayment,
  verifyWebhookSignature,
  checkStatus,
  pendingTxns,
} = require("./paytm.service");

const paytmRouter  = express.Router();  // private — mounted under /payments/paytm
const paytmWebhook = express.Router();  // public  — mounted under /webhooks

const PUBLIC_API_URL = process.env.PUBLIC_API_URL || "https://api.dinexpos.in";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function getOutletPaytmCreds(data, outletId) {
  const outlet = (data?.outlets || []).find(o => o.id === outletId);
  const cfg    = outlet?.paymentConfig?.upi;
  if (
    cfg?.mode !== "paytm_dynamic" ||
    !cfg?.paytmMerchantId ||
    !cfg?.paytmMerchantKey
  ) return null;
  return {
    merchantId:  cfg.paytmMerchantId,
    merchantKey: cfg.paytmMerchantKey,
    mode:        cfg.paytmMode || "STAGING",
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC — Paytm webhook
// POST /webhooks/paytm
// ─────────────────────────────────────────────────────────────────────────────
paytmWebhook.post(
  "/paytm",
  express.urlencoded({ extended: true }),
  express.json(),
  asyncHandler(async (req, res) => {
    const body = req.body || {};
    const orderId = body.ORDER_ID;
    const txnContext = orderId ? pendingTxns.get(orderId) : null;

    // Verify signature using outlet's merchant key
    if (txnContext) {
      const tenantData = await runWithTenant(txnContext.tenantId, () => getOwnerSetupData());
      const creds = getOutletPaytmCreds(tenantData, txnContext.outletId);
      if (creds?.merchantKey) {
        try {
          verifyWebhookSignature(body, creds.merchantKey);
        } catch (err) {
          console.warn("[paytm webhook] signature mismatch:", err.message);
          return res.status(401).send("Signature mismatch");
        }
      }
    }

    const success = body.STATUS === "TXN_SUCCESS" || body.RESPCODE === "01";

    console.log(`[paytm webhook] orderId=${orderId} | status=${body.STATUS} | success=${success}`);

    if (success && txnContext) {
      pendingTxns.delete(orderId);
      const { tenantId, outletId, tableId, tableLabel, amount, orderNumber } = txnContext;

      const io = req.app.locals.io;
      if (io) {
        io.to(`outlet:${tenantId}:${outletId}`).emit("payment:paytm:confirmed", {
          tableId,
          tableLabel,
          amount,
          orderNumber,
          orderId,
          txnId: body.TXNID || "",
          bankTxnId: body.BANKTXNID || "",
          utr: body.BANKTXNID || body.TXNID || "",
          confirmedAt: new Date().toISOString(),
        });
      }
    }

    res.status(200).send("OK");
  })
);

// ─────────────────────────────────────────────────────────────────────────────
// PRIVATE — Initiate payment
// POST /payments/paytm/initiate
// Body: { outletId, tableId, tableLabel, amount, orderNumber }
// ─────────────────────────────────────────────────────────────────────────────
paytmRouter.post(
  "/initiate",
  requireAuth,
  asyncHandler(async (req, res) => {
    const tenantId = req.user?.tenantId || "default";
    const { outletId, tableId, tableLabel, amount, orderNumber } = req.body;

    if (!outletId || !tableId || !amount) {
      return res.status(400).json({ error: "outletId, tableId and amount are required" });
    }

    const data  = await runWithTenant(tenantId, () => getOwnerSetupData());
    const creds = getOutletPaytmCreds(data, outletId);

    if (!creds) {
      return res.status(400).json({
        error: "Paytm dynamic QR not configured for this outlet."
      });
    }

    const callbackUrl = `${PUBLIC_API_URL}/webhooks/paytm`;

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
// GET /payments/paytm/status/:orderId
// ─────────────────────────────────────────────────────────────────────────────
paytmRouter.get(
  "/status/:orderId",
  requireAuth,
  asyncHandler(async (req, res) => {
    const tenantId = req.user?.tenantId || "default";
    const txnCtx   = pendingTxns.get(req.params.orderId);

    const data  = await runWithTenant(tenantId, () => getOwnerSetupData());
    const outletId = txnCtx?.outletId || req.query.outletId;
    const creds = outletId ? getOutletPaytmCreds(data, outletId) : null;

    if (!creds) return res.status(400).json({ error: "Paytm not configured for this outlet" });

    const result  = await checkStatus(req.params.orderId, creds);
    const success = result?.STATUS === "TXN_SUCCESS" || result?.RESPCODE === "01";
    res.json({ ...result, resolved: success });
  })
);

// ─────────────────────────────────────────────────────────────────────────────
// PRIVATE — Get config status for an outlet
// GET /payments/paytm/config?outletId=...
// ─────────────────────────────────────────────────────────────────────────────
paytmRouter.get(
  "/config",
  requireAuth,
  asyncHandler(async (req, res) => {
    const tenantId = req.user?.tenantId || "default";
    const { outletId } = req.query;
    const data   = await runWithTenant(tenantId, () => getOwnerSetupData());
    const outlet = (data?.outlets || []).find(o => o.id === outletId);
    const cfg    = outlet?.paymentConfig?.upi || {};

    res.json({
      mode:              cfg.mode || "static",
      paytmMode:         cfg.paytmMode || "STAGING",
      merchantIdSet:     !!cfg.paytmMerchantId,
      merchantKeySet:    !!cfg.paytmMerchantKey,
      configured:        !!(cfg.paytmMerchantId && cfg.paytmMerchantKey && cfg.mode === "paytm_dynamic"),
    });
  })
);

module.exports = { paytmRouter, paytmWebhook };
