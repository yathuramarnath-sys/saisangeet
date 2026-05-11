/**
 * urbanpiper.service.js
 *
 * Handles all outbound calls to the UrbanPiper API.
 *
 * UrbanPiper API reference:
 *   Base URL : https://api.urbanpiper.com
 *   Auth     : Authorization: apikey <biz_id>:<api_key>
 *
 * Endpoints we use:
 *   POST /api/v2/orders/{up_order_id}/accept/
 *   POST /api/v2/orders/{up_order_id}/cancel/
 *   POST /api/v2/orders/{up_order_id}/mark-food-ready/
 *
 * Credentials stored per tenant in ownerSetupData.onlineOrders.urbanPiper:
 *   { bizId: "...", apiKey: "...", enabled: true }
 */

const https = require("https");

const UP_BASE_URL = "https://api.urbanpiper.com";

/**
 * Make an authenticated POST request to UrbanPiper.
 * Returns { ok: true } on 2xx, throws on error.
 */
function upPost(path, body, { bizId, apiKey }) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body || {});
    const auth    = Buffer.from(`${bizId}:${apiKey}`).toString("base64");

    const options = {
      hostname: "api.urbanpiper.com",
      path,
      method: "POST",
      headers: {
        "Content-Type":  "application/json",
        "Authorization": `apikey ${bizId}:${apiKey}`,
        "Content-Length": Buffer.byteLength(payload),
      },
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", chunk => { data += chunk; });
      res.on("end", () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve({ ok: true, status: res.statusCode, body: data });
        } else {
          reject(new Error(`UrbanPiper ${path} → HTTP ${res.statusCode}: ${data}`));
        }
      });
    });

    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

/**
 * Extract UrbanPiper credentials from tenant config.
 * Returns null if not configured or not enabled.
 */
function getUpCreds(tenantData) {
  const cfg = tenantData?.onlineOrders?.urbanPiper;
  if (!cfg?.enabled || !cfg?.bizId || !cfg?.apiKey) return null;
  return { bizId: cfg.bizId, apiKey: cfg.apiKey };
}

/**
 * Acknowledge / Accept an order.
 * Called when cashier taps "Accept & Send KOT" on POS.
 *
 * UrbanPiper: POST /api/v2/orders/{up_order_id}/accept/
 * Body: { "preparation_time": <minutes> }
 */
async function acceptOrder(upOrderId, tenantData, { prepMins = 20 } = {}) {
  const creds = getUpCreds(tenantData);
  if (!creds) {
    console.log(`[urbanpiper] accept skipped — credentials not configured`);
    return { ok: true, skipped: true };
  }
  try {
    const result = await upPost(
      `/api/v2/orders/${upOrderId}/accept/`,
      { preparation_time: prepMins },
      creds
    );
    console.log(`[urbanpiper] accepted order ${upOrderId}`);
    return result;
  } catch (err) {
    console.error(`[urbanpiper] accept failed for ${upOrderId}:`, err.message);
    return { ok: false, error: err.message };
  }
}

/**
 * Reject / Cancel an order.
 * Called when cashier taps "Reject" on POS.
 *
 * UrbanPiper: POST /api/v2/orders/{up_order_id}/cancel/
 * Body: { "cancellation_reason": "<reason>" }
 */
async function rejectOrder(upOrderId, tenantData, { reason = "Restaurant busy" } = {}) {
  const creds = getUpCreds(tenantData);
  if (!creds) {
    console.log(`[urbanpiper] reject skipped — credentials not configured`);
    return { ok: true, skipped: true };
  }
  try {
    const result = await upPost(
      `/api/v2/orders/${upOrderId}/cancel/`,
      { cancellation_reason: reason },
      creds
    );
    console.log(`[urbanpiper] rejected order ${upOrderId} — reason: ${reason}`);
    return result;
  } catch (err) {
    console.error(`[urbanpiper] reject failed for ${upOrderId}:`, err.message);
    return { ok: false, error: err.message };
  }
}

/**
 * Mark order food as ready (optional — for delivery tracking).
 * Called when KDS chef taps "Ready".
 *
 * UrbanPiper: POST /api/v2/orders/{up_order_id}/mark-food-ready/
 */
async function markFoodReady(upOrderId, tenantData) {
  const creds = getUpCreds(tenantData);
  if (!creds) return { ok: true, skipped: true };
  try {
    const result = await upPost(`/api/v2/orders/${upOrderId}/mark-food-ready/`, {}, creds);
    console.log(`[urbanpiper] marked food ready for order ${upOrderId}`);
    return result;
  } catch (err) {
    console.error(`[urbanpiper] mark-food-ready failed for ${upOrderId}:`, err.message);
    return { ok: false, error: err.message };
  }
}

module.exports = { acceptOrder, rejectOrder, markFoodReady, getUpCreds };
