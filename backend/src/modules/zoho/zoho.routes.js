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
 *   (exported as handleZohoCallback, mounted directly on apiRouter in
 *    routes/index.js BEFORE requireTenant — not part of zohoRouter below,
 *    since zohoRouter sits behind the global requireTenant gate)
 *
 * Per-tenant zoho config stored in ownerSetupData.zoho:
 *   { clientId, clientSecret, accessToken, refreshToken, expiresAt,
 *     organizationId, orgName, walkInContactId, taxMap, stateCode,
 *     syncStartDate, connectedAt, lastSyncAt, totalPushed,
 *     cashAccountId, cashAccountName, bankAccountId, bankAccountName,
 *     miscExpenseAccountId,
 *     accountOverrides: { cash, card, upi, other, cashOutExpense } —
 *       each either null or { accountId, accountName }, set via
 *       POST /integrations/zoho/account-overrides. Takes precedence over
 *       the auto-detected cashAccountId/bankAccountId/miscExpenseAccountId
 *       above when routing a sale's deposit account or a cash-out expense. }
 *
 * syncStartDate (YYYY-MM-DD, optional): orders that closed before this date
 * are skipped by the auto-push (see operations.controller.js). Lets an owner
 * who connects mid-month avoid bulk-pushing/backfilling older sales.
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
  fetchAccountIds,
  listChartOfAccounts,
} = require("./zoho.service");

const ACCOUNT_OVERRIDE_BUCKETS = ["cash", "card", "upi", "other", "cashOutExpense"];

const zohoRouter = express.Router();   // private routes only — see handleZohoCallback below

const PUBLIC_API_URL  = process.env.PUBLIC_API_URL  || "https://api.dinexpos.in";
const OWNER_WEB_URL   = process.env.OWNER_WEB_URL   || "https://app.dinexpos.in";
// Redirect URI must exactly match what's registered in Zoho Developer Console
const REDIRECT_URI    = `${PUBLIC_API_URL}/api/v1/integrations/zoho/callback`;

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC — OAuth callback (no JWT — Zoho redirects here)
// GET /api/v1/integrations/zoho/callback?code=...&state=tenantId
//
// NOT mounted on zohoRouter — zohoRouter is mounted under apiRouter AFTER the
// global requireTenant gate (routes/index.js), which would 401 this request
// before it ever runs since Zoho's redirect carries no JWT. Exported instead
// and mounted directly on apiRouter before requireTenant, same pattern as
// POST /devices/resolve-link-code.
// ─────────────────────────────────────────────────────────────────────────────
const handleZohoCallback = asyncHandler(async (req, res) => {
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
      let cashAccountId = null, bankAccountId = null, miscExpenseAccountId = null;
      let cashAccountName = null, bankAccountName = null;
      try {
        const orgs = await getOrganizations(tokens.accessToken);
        if (orgs.length > 0) {
          orgId   = orgs[0].organization_id;
          orgName = orgs[0].name;
        }
        if (orgId) {
          walkInContactId = await getOrCreateWalkInContact(orgId, tokens.accessToken);
          taxMap          = await fetchTaxMap(orgId, tokens.accessToken);
          ({ cashAccountId, cashAccountName, bankAccountId, bankAccountName, miscExpenseAccountId } =
            await fetchAccountIds(orgId, tokens.accessToken));
          console.log(`[zoho] account mapping | cash=${cashAccountName || "none"} (${cashAccountId}) | bank=${bankAccountName || "none"} (${bankAccountId})`);
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
            cashAccountId,
            cashAccountName,
            bankAccountId,
            bankAccountName,
            miscExpenseAccountId,
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
});

// ─────────────────────────────────────────────────────────────────────────────
// PRIVATE — Save client credentials
// POST /integrations/zoho/config
// Body: { clientId, clientSecret, stateCode, enabled, syncStartDate }
// ─────────────────────────────────────────────────────────────────────────────
zohoRouter.post(
  "/config",
  requireAuth,
  asyncHandler(async (req, res) => {
    const tenantId = req.user?.tenantId || "default";
    const { clientId, clientSecret, stateCode, enabled, syncStartDate } = req.body;

    if (syncStartDate && !/^\d{4}-\d{2}-\d{2}$/.test(syncStartDate)) {
      return res.status(400).json({ error: "syncStartDate must be YYYY-MM-DD." });
    }

    await runWithTenant(tenantId, () =>
      updateOwnerSetupData(d => ({
        ...d,
        zoho: {
          ...d.zoho,
          clientId:    clientId    ?? d.zoho?.clientId    ?? "",
          clientSecret: clientSecret ?? d.zoho?.clientSecret ?? "",
          stateCode:   stateCode   ?? d.zoho?.stateCode   ?? "TN",
          enabled:     enabled     ?? d.zoho?.enabled     ?? false,
          syncStartDate: syncStartDate !== undefined ? (syncStartDate || null) : (d.zoho?.syncStartDate ?? null),
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
      syncStartDate:   cfg.syncStartDate   || null,
      connectedAt:     cfg.connectedAt     || null,
      lastSyncAt:      cfg.lastSyncAt      || null,
      totalPushed:     cfg.totalPushed     || 0,
      cashAccountName: cfg.cashAccountName || null,
      bankAccountName: cfg.bankAccountName || null,
      accountOverrides: cfg.accountOverrides || {},
      redirectUri:     REDIRECT_URI,
    });
  })
);

// ─────────────────────────────────────────────────────────────────────────────
// PRIVATE — List live Chart of Accounts (for account-routing dropdowns)
// GET /integrations/zoho/accounts
// ─────────────────────────────────────────────────────────────────────────────
zohoRouter.get(
  "/accounts",
  requireAuth,
  asyncHandler(async (req, res) => {
    const tenantId = req.user?.tenantId || "default";
    const data     = await runWithTenant(tenantId, () => getOwnerSetupData());
    const cfg      = data?.zoho;

    if (!cfg?.refreshToken || !cfg?.organizationId) {
      return res.status(400).json({ error: "Not connected. Complete OAuth first." });
    }

    const { accessToken } = await getValidToken(cfg);
    const accounts = await listChartOfAccounts(cfg.organizationId, accessToken);
    res.json({ accounts });
  })
);

// ─────────────────────────────────────────────────────────────────────────────
// PRIVATE — Save per-payment-method account routing overrides
// POST /integrations/zoho/account-overrides
// Body: { cash: {accountId, accountName} | null, card: ..., upi: ..., other: ...,
//         cashOutExpense: ... }
// Lets the owner pin Card/UPI/Cash-out Expense to a specific Zoho account
// instead of relying on name-matching against the Chart of Accounts, which
// can land on the wrong account (e.g. "Bank Fees and Charges") or miss an
// account the owner just added and marked default in Zoho.
// ─────────────────────────────────────────────────────────────────────────────
zohoRouter.post(
  "/account-overrides",
  requireAuth,
  asyncHandler(async (req, res) => {
    const tenantId = req.user?.tenantId || "default";
    const body = req.body || {};

    const overrides = {};
    for (const bucket of ACCOUNT_OVERRIDE_BUCKETS) {
      if (!(bucket in body)) continue;
      const value = body[bucket];
      if (value === null) {
        overrides[bucket] = null;
      } else if (value?.accountId) {
        overrides[bucket] = { accountId: value.accountId, accountName: value.accountName || "" };
      }
    }

    await runWithTenant(tenantId, () =>
      updateOwnerSetupData(d => ({
        ...d,
        zoho: {
          ...d.zoho,
          accountOverrides: {
            ...(d.zoho?.accountOverrides || {}),
            ...overrides,
          },
        },
      }))
    );

    res.json({ ok: true });
  })
);

// ─────────────────────────────────────────────────────────────────────────────
// PRIVATE — Re-sync account mapping (cash/bank/expense accounts)
// POST /integrations/zoho/sync-accounts
// Re-fetches the Chart of Accounts and updates the cached account IDs without
// requiring a full disconnect/reconnect — needed when the owner adds/renames
// their Bank account in Zoho Books after the initial connect.
// ─────────────────────────────────────────────────────────────────────────────
zohoRouter.post(
  "/sync-accounts",
  requireAuth,
  asyncHandler(async (req, res) => {
    const tenantId = req.user?.tenantId || "default";
    const data     = await runWithTenant(tenantId, () => getOwnerSetupData());
    const cfg      = data?.zoho;

    if (!cfg?.refreshToken || !cfg?.organizationId) {
      return res.status(400).json({ error: "Not connected. Complete OAuth first." });
    }

    const { accessToken } = await getValidToken(cfg);
    const { cashAccountId, cashAccountName, bankAccountId, bankAccountName, miscExpenseAccountId } =
      await fetchAccountIds(cfg.organizationId, accessToken);

    await runWithTenant(tenantId, () =>
      updateOwnerSetupData(d => ({
        ...d,
        zoho: {
          ...d.zoho,
          cashAccountId,
          cashAccountName,
          bankAccountId,
          bankAccountName,
          miscExpenseAccountId,
        },
      }))
    );

    console.log(`[zoho] account mapping re-synced | tenant=${tenantId} | cash=${cashAccountName || "none"} | bank=${bankAccountName || "none"}`);
    res.json({ ok: true, cashAccountName, bankAccountName });
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
          syncStartDate: d.zoho?.syncStartDate ?? null,
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
      res.json({ ok: true, receiptNumber: result.invoiceNumber });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  })
);

module.exports = { zohoRouter, handleZohoCallback };
