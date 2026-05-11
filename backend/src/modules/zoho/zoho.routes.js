/**
 * zoho.routes.js
 *
 * PRIVATE (JWT):
 *   POST /integrations/zoho/config         — save clientId + clientSecret + stateCode
 *   GET  /integrations/zoho/config         — get connection status (never returns secrets)
 *   GET  /integrations/zoho/auth-url       — get OAuth URL to redirect owner to Zoho
 *   DELETE /integrations/zoho/disconnect   — revoke & clear tokens
 *   POST /integrations/zoho/test           — push a dummy receipt to verify connection
 *
 * PUBLIC (no JWT):
 *   GET  /integrations/zoho/callback       — Zoho OAuth redirect handler
 *   (also mounted under /api/v1 so the full path is /api/v1/integrations/zoho/callback)
 *
 * Per-tenant zoho config stored in ownerSetupData.zoho:
 *   { clientId, clientSecret, accessToken, refreshToken, expiresAt,
 *     organizationId, orgName, walkInContactId, taxMap, stateCode,
 *     connectedAt, lastSyncAt, totalPushed }
 */

const express       = require("express");
const { requireAuth }   = require("../../middleware/require-auth");
const { asyncHandler }  = require("../../utils/async-handler");
const { runWithTenant } = require("../../data/tenant-context");
const {
  getOwnerSetupData,
  updateOwnerSetupData,
} = require("../../data/owner-setup-store");
const {
  buildAuthUrl,
  exchangeCode,
  getValidToken,
  getOrganizations,
  getOrCreateWalkInContact,
  fetchTaxMap,
} = require("./zoho.service");

const zohoRouter = express.Router();   // private + public callback

const PUBLIC_API_URL  = process.env.PUBLIC_API_URL  || "https://api.dinexpos.in";
const OWNER_WEB_URL   = process.env.OWNER_WEB_URL   || "https://app.dinexpos.in";
// Redirect URI must exactly match what's registered in Zoho Developer Console
const REDIRECT_URI    = `${PUBLIC_API_URL}/api/v1/integrations/zoho/callback`;

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC — OAuth callback (no JWT — Zoho redirects here)
// GET /api/v1/integrations/zoho/callback?code=...&state=tenantId
// ─────────────────────────────────────────────────────────────────────────────
zohoRouter.get(
  "/callback",
  asyncHandler(async (req, res) => {
    const { code, state: tenantId, error } = req.query;

    const failRedirect = (msg) =>
      res.redirect(`${OWNER_WEB_URL}/integrations?zoho_error=${encodeURIComponent(msg)}`);

    if (error) return failRedirect(`Zoho declined: ${error}`);
    if (!code)  return failRedirect("No authorization code received from Zoho.");
    if (!tenantId) return failRedirect("Missing tenant state parameter.");

    try {
      // Get client credentials for this tenant
      const data = await runWithTenant(tenantId, () => getOwnerSetupData());
      const cfg  = data?.zoho;
      if (!cfg?.clientId || !cfg?.clientSecret) {
        return failRedirect("Client ID or Secret not saved. Save them first in Integrations.");
      }

      // Exchange code for tokens
      const tokens = await exchangeCode(cfg.clientId, cfg.clientSecret, code, REDIRECT_URI);

      // Fetch organization info
      let orgId = "", orgName = "", walkInContactId = "", taxMap = {};
      try {
        const orgs = await getOrganizations(tokens.accessToken);
        if (orgs.length > 0) {
          orgId   = orgs[0].organization_id;
          orgName = orgs[0].name;
        }
        if (orgId) {
          walkInContactId = await getOrCreateWalkInContact(orgId, tokens.accessToken);
          taxMap          = await fetchTaxMap(orgId, tokens.accessToken);
        }
      } catch (orgErr) {
        console.warn("[zoho callback] org/contact fetch failed:", orgErr.message);
      }

      // Persist tokens + org info
      await runWithTenant(tenantId, () =>
        updateOwnerSetupData(d => ({
          ...d,
          zoho: {
            ...d.zoho,
            accessToken:      tokens.accessToken,
            refreshToken:     tokens.refreshToken,
            expiresAt:        tokens.expiresAt,
            organizationId:   orgId,
            orgName,
            walkInContactId,
            taxMap,
            connectedAt:      new Date().toISOString(),
            lastSyncAt:       null,
            totalPushed:      d.zoho?.totalPushed || 0,
          },
        }))
      );

      console.log(`[zoho] connected | tenant=${tenantId} | org=${orgName} (${orgId})`);
      res.redirect(`${OWNER_WEB_URL}/integrations?zoho_connected=1`);

    } catch (err) {
      console.error(`[zoho callback] error for tenant ${tenantId}:`, err.message);
      failRedirect(err.message || "OAuth failed");
    }
  })
);

// ─────────────────────────────────────────────────────────────────────────────
// PRIVATE — Save client credentials
// POST /integrations/zoho/config
// Body: { clientId, clientSecret, stateCode, enabled }
// ─────────────────────────────────────────────────────────────────────────────
zohoRouter.post(
  "/config",
  requireAuth,
  asyncHandler(async (req, res) => {
    const tenantId = req.user?.tenantId || "default";
    const { clientId, clientSecret, stateCode, enabled } = req.body;

    await runWithTenant(tenantId, () =>
      updateOwnerSetupData(d => ({
        ...d,
        zoho: {
          ...d.zoho,
          clientId:    clientId    ?? d.zoho?.clientId    ?? "",
          clientSecret: clientSecret ?? d.zoho?.clientSecret ?? "",
          stateCode:   stateCode   ?? d.zoho?.stateCode   ?? "TN",
          enabled:     enabled     ?? d.zoho?.enabled     ?? false,
        },
      }))
    );
    res.json({ ok: true });
  })
);

// ─────────────────────────────────────────────────────────────────────────────
// PRIVATE — Get OAuth URL
// GET /integrations/zoho/auth-url
// ─────────────────────────────────────────────────────────────────────────────
zohoRouter.get(
  "/auth-url",
  requireAuth,
  asyncHandler(async (req, res) => {
    const tenantId = req.user?.tenantId || "default";
    const data     = await runWithTenant(tenantId, () => getOwnerSetupData());
    const cfg      = data?.zoho;

    if (!cfg?.clientId) {
      return res.status(400).json({ error: "Save your Client ID first." });
    }

    const url = buildAuthUrl(cfg.clientId, REDIRECT_URI, tenantId);
    res.json({ url });
  })
);

// ─────────────────────────────────────────────────────────────────────────────
// PRIVATE — Get connection status
// GET /integrations/zoho/config
// ─────────────────────────────────────────────────────────────────────────────
zohoRouter.get(
  "/config",
  requireAuth,
  asyncHandler(async (req, res) => {
    const tenantId = req.user?.tenantId || "default";
    const data     = await runWithTenant(tenantId, () => getOwnerSetupData());
    const cfg      = data?.zoho || {};

    res.json({
      clientIdSet:     !!cfg.clientId,
      secretSet:       !!cfg.clientSecret,
      connected:       !!(cfg.accessToken && cfg.refreshToken),
      orgName:         cfg.orgName         || "",
      organizationId:  cfg.organizationId  || "",
      stateCode:       cfg.stateCode       || "TN",
      enabled:         !!cfg.enabled,
      connectedAt:     cfg.connectedAt     || null,
      lastSyncAt:      cfg.lastSyncAt      || null,
      totalPushed:     cfg.totalPushed     || 0,
      redirectUri:     REDIRECT_URI,
    });
  })
);

// ─────────────────────────────────────────────────────────────────────────────
// PRIVATE — Disconnect (clear tokens)
// DELETE /integrations/zoho/disconnect
// ─────────────────────────────────────────────────────────────────────────────
zohoRouter.delete(
  "/disconnect",
  requireAuth,
  asyncHandler(async (req, res) => {
    const tenantId = req.user?.tenantId || "default";
    await runWithTenant(tenantId, () =>
      updateOwnerSetupData(d => ({
        ...d,
        zoho: {
          clientId:     d.zoho?.clientId     || "",
          clientSecret: d.zoho?.clientSecret || "",
          stateCode:    d.zoho?.stateCode    || "TN",
          enabled:      false,
          // Clear all OAuth tokens and org info
          accessToken:      null,
          refreshToken:     null,
          expiresAt:        null,
          organizationId:   null,
          orgName:          null,
          walkInContactId:  null,
          taxMap:           {},
          connectedAt:      null,
          lastSyncAt:       d.zoho?.lastSyncAt  || null,
          totalPushed:      d.zoho?.totalPushed || 0,
        },
      }))
    );
    console.log(`[zoho] disconnected | tenant=${tenantId}`);
    res.json({ ok: true });
  })
);

// ─────────────────────────────────────────────────────────────────────────────
// PRIVATE — Test connection (push a ₹1 test receipt)
// POST /integrations/zoho/test
// ─────────────────────────────────────────────────────────────────────────────
zohoRouter.post(
  "/test",
  requireAuth,
  asyncHandler(async (req, res) => {
    const tenantId = req.user?.tenantId || "default";
    const data     = await runWithTenant(tenantId, () => getOwnerSetupData());
    const cfg      = data?.zoho;

    if (!cfg?.refreshToken) {
      return res.status(400).json({ error: "Not connected. Complete OAuth first." });
    }

    // Verify token works
    const { pushSaleReceipt } = require("./zoho.service");
    const testOrder = {
      orderNumber:  `TEST-${Date.now()}`,
      billNo:       `TEST-${Date.now()}`,
      closedAt:     new Date().toISOString(),
      tableLabel:   "Test",
      areaName:     "Test",
      tableNumber:  "0",
      cashierName:  "Test",
      payments:     [{ method: "cash", amount: 1 }],
      discountAmount: 0,
      items: [{
        name: "Test Item", price: 1, quantity: 1,
        taxRate: 5, isVoided: false, isComp: false,
      }],
    };

    try {
      await getValidToken(cfg);
      const result = await pushSaleReceipt(testOrder, cfg, cfg.taxMap || {});
      res.json({ ok: true, receiptNumber: result.receiptNumber });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  })
);

module.exports = { zohoRouter };
