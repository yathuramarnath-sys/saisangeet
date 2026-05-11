/**
 * borzo.service.js
 *
 * Borzo (formerly WeFast) Business API — on-demand restaurant delivery.
 * API docs: https://borzodelivery.com/in/business-api/doc
 *
 * Auth:    X-DV-Auth-Token header (token from Borzo dashboard)
 * Sandbox: https://robotapitest-in.borzodelivery.com/api/business/1.6
 * Prod:    https://robot-in.borzodelivery.com/api/business/1.6
 *
 * vehicle_type_id 8 = Motorbike (up to 20 kg) — standard for food delivery
 *
 * pendingDeliveries Map: borzoOrderId → { tenantId, outletId, onlineOrderId, tableId }
 * Used to route webhook callbacks back to the correct outlet socket room.
 */

const https  = require("https");

const SANDBOX_BASE = "robotapitest-in.borzodelivery.com";
const PROD_BASE    = "robot-in.borzodelivery.com";
const API_PATH     = "/api/business/1.6";

// In-memory map: borzoOrderId → context
const pendingDeliveries = new Map();

// ─────────────────────────────────────────────────────────────────────────────
// Internal HTTP helper
// ─────────────────────────────────────────────────────────────────────────────

function borzoRequest(hostname, method, endpoint, body, token) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const opts = {
      hostname,
      path:   API_PATH + endpoint,
      method,
      headers: {
        "Content-Type":     "application/json",
        "X-DV-Auth-Token":  token,
        ...(payload ? { "Content-Length": Buffer.byteLength(payload) } : {}),
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
    if (payload) req.write(payload);
    req.end();
  });
}

function host(mode) {
  return mode === "production" ? PROD_BASE : SANDBOX_BASE;
}

// ─────────────────────────────────────────────────────────────────────────────
// Calculate delivery fee (before dispatching)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @param {object} opts
 *   pickup: { address, contactName, contactPhone }
 *   drop:   { address, contactName, contactPhone, collectAmount }
 * @param {object} creds  { token, mode }
 */
async function calculateDelivery(opts, creds) {
  const { pickup, drop } = opts;
  const { token, mode = "sandbox" } = creds;

  const body = {
    vehicle_type_id: 8,   // Motorbike
    matter: "Food order",
    points: [
      {
        address:        pickup.address,
        contact_person: { name: pickup.contactName, phone: pickup.contactPhone },
      },
      {
        address:        drop.address,
        contact_person: { name: drop.contactName, phone: drop.contactPhone },
        taking_amount:  drop.collectAmount || 0,
      },
    ],
  };

  const result = await borzoRequest(host(mode), "POST", "/calculate-order", body, token);
  if (!result.body?.is_successful) {
    throw new Error(
      result.body?.parameter_errors?.[0]?.message ||
      result.body?.errors?.[0]?.message ||
      "Borzo calculate failed"
    );
  }

  const order = result.body.order;
  return {
    deliveryFeeMin: order?.payment_amount,
    deliveryFeeMax: order?.weight_payment_amount || order?.payment_amount,
    eta:            order?.delivery_eta_min,
    currency:       "INR",
    rawOrder:       order,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Dispatch rider — create delivery order
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @param {object} opts
 *   context:    { tenantId, outletId, onlineOrderId, orderRef }
 *   pickup:     { address, contactName, contactPhone }
 *   drop:       { address, contactName, contactPhone, collectAmount }
 *   notes:      string (optional — e.g. "Don't ring bell")
 *   callbackUrl: string — our public webhook URL
 * @param {object} creds  { token, mode }
 */
async function dispatchRider(opts, creds) {
  const { context, pickup, drop, notes, callbackUrl } = opts;
  const { token, mode = "sandbox" } = creds;

  const body = {
    vehicle_type_id:   8,
    matter:            `Food delivery — ${context.orderRef || context.onlineOrderId}`,
    payment_method:    "cash",   // Restaurant pays Borzo; collect cash-on-delivery from customer if needed
    callback_url:      callbackUrl,
    points: [
      {
        address:        pickup.address,
        contact_person: { name: pickup.contactName, phone: pickup.contactPhone },
      },
      {
        address:        drop.address,
        contact_person: { name: drop.contactName, phone: drop.contactPhone },
        taking_amount:  drop.collectAmount || 0,   // 0 if already paid online
        note:           notes || "",
      },
    ],
  };

  const result = await borzoRequest(host(mode), "POST", "/create-order", body, token);
  if (!result.body?.is_successful) {
    const msg =
      result.body?.parameter_errors?.[0]?.message ||
      result.body?.errors?.[0]?.message ||
      "Borzo dispatch failed";
    throw new Error(msg);
  }

  const order = result.body.order;
  const borzoOrderId = String(order.order_id || order.id);

  // Store context so webhook can resolve the outlet
  pendingDeliveries.set(borzoOrderId, {
    ...context,
    borzoOrderId,
    dispatchedAt: new Date().toISOString(),
  });

  // Auto-expire after 6 hours
  setTimeout(() => pendingDeliveries.delete(borzoOrderId), 6 * 60 * 60 * 1000);

  console.log(`[borzo] dispatched | orderId=${borzoOrderId} | ref=${context.orderRef} | mode=${mode}`);

  return {
    borzoOrderId,
    status:          order.status || "new",
    deliveryFee:     order.payment_amount,
    trackingUrl:     order.tracking_url || null,
    courierName:     order.courier?.name    || null,
    courierPhone:    order.courier?.phone   || null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Get live delivery status (polling fallback)
// ─────────────────────────────────────────────────────────────────────────────

async function getDeliveryStatus(borzoOrderId, creds) {
  const { token, mode = "sandbox" } = creds;
  const result = await borzoRequest(
    host(mode), "GET",
    `/order?order_id=${borzoOrderId}`, null, token
  );
  if (!result.body?.is_successful) {
    throw new Error("Borzo status check failed");
  }
  const order = result.body.order;
  return {
    borzoOrderId,
    status:       order.status,
    courierName:  order.courier?.name  || null,
    courierPhone: order.courier?.phone || null,
    trackingUrl:  order.tracking_url   || null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Cancel delivery
// ─────────────────────────────────────────────────────────────────────────────

async function cancelDelivery(borzoOrderId, creds) {
  const { token, mode = "sandbox" } = creds;
  const result = await borzoRequest(
    host(mode), "POST",
    "/cancel-order", { order_id: Number(borzoOrderId) }, token
  );
  if (!result.body?.is_successful) {
    throw new Error(result.body?.errors?.[0]?.message || "Borzo cancel failed");
  }
  pendingDeliveries.delete(borzoOrderId);
  console.log(`[borzo] cancelled | orderId=${borzoOrderId}`);
  return { cancelled: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// Parse incoming webhook payload from Borzo
// Returns { borzoOrderId, status, courierName, courierPhone, isTerminal }
// ─────────────────────────────────────────────────────────────────────────────

const TERMINAL_STATUSES = new Set(["completed", "canceled", "failed", "returned"]);

function parseWebhook(body) {
  // Borzo sends: { type: "order_callback"|"delivery_callback", data: { order: {...} } }
  const order = body?.data?.order || body?.order;
  if (!order) throw new Error("No order in Borzo webhook");

  const borzoOrderId = String(order.order_id || order.id);
  const status       = (order.status || "").toLowerCase();
  const courier      = order.courier || {};

  return {
    borzoOrderId,
    status,
    courierName:  courier.name  || null,
    courierPhone: courier.phone || null,
    trackingUrl:  order.tracking_url || null,
    isTerminal:   TERMINAL_STATUSES.has(status),
    raw:          order,
  };
}

module.exports = {
  calculateDelivery,
  dispatchRider,
  getDeliveryStatus,
  cancelDelivery,
  parseWebhook,
  pendingDeliveries,
};
