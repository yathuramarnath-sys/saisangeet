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
  pushSaleReceipt,
  pushExpense,
} = require("./zoho.service");
const { isDatabaseEnabled } = require("../../db/database-mode");
const { queryClosedOrders } = require("../../db/closed-orders.repository");
const { getSalesForRange } = require("../operations/closed-orders-store");
const { getShifts } = require("../operations/shifts-store");

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
      let cashAccountId = null, bankAccountId = null, miscExpenseAccountId = null, miscExpenseAccountName = null;
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
          ({ cashAccountId, cashAccountName, bankAccountId, bankAccountName, miscExpenseAccountId, miscExpenseAccountName } =
            await fetchAccountIds(orgId, tokens.accessToken));
          console.log(`[zoho] account mapping | cash=${cashAccountName || "none"} (${cashAccountId}) | bank=${bankAccountName || "none"} (${bankAccountId}) | expense=${miscExpenseAccountName || "none"} (${miscExpenseAccountId})`);
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
            miscExpenseAccountName,
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
      miscExpenseAccountName: cfg.miscExpenseAccountName || null,
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
    const { cashAccountId, cashAccountName, bankAccountId, bankAccountName, miscExpenseAccountId, miscExpenseAccountName } =
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
          miscExpenseAccountName,
        },
      }))
    );

    console.log(`[zoho] account mapping re-synced | tenant=${tenantId} | cash=${cashAccountName || "none"} | bank=${bankAccountName || "none"} | expense=${miscExpenseAccountName || "none"}`);
    res.json({ ok: true, cashAccountName, bankAccountName, miscExpenseAccountName });
  })
);

// ─────────────────────────────────────────────────────────────────────────────
// PRIVATE — Backfill already-closed sales since a date into Zoho
// POST /integrations/zoho/backfill-sales
// Body: { dateFrom?, dateTo? } — both "YYYY-MM-DD", optional.
// syncStartDate only stops orders from being skipped going forward (see
// operations.controller.js) — it never pushes orders that closed before the
// owner connected/configured it. This walks closed orders for the given
// range (defaults to syncStartDate-or-month-start through today) and pushes
// any that aren't already in Zoho. Safe to re-run: pushSaleReceipt looks up
// the invoice by number before creating, so already-pushed orders are skipped.
// ─────────────────────────────────────────────────────────────────────────────
zohoRouter.post(
  "/backfill-sales",
  requireAuth,
  asyncHandler(async (req, res) => {
    const tenantId = req.user?.tenantId || "default";
    const data      = await runWithTenant(tenantId, () => getOwnerSetupData());
    const cfg       = data?.zoho;

    if (!cfg?.enabled || !cfg?.refreshToken || !cfg?.organizationId) {
      return res.status(400).json({ error: "Zoho is not connected/enabled." });
    }

    let { dateFrom, dateTo } = req.body || {};
    if (dateFrom && !/^\d{4}-\d{2}-\d{2}$/.test(dateFrom)) {
      return res.status(400).json({ error: "dateFrom must be YYYY-MM-DD." });
    }
    if (dateTo && !/^\d{4}-\d{2}-\d{2}$/.test(dateTo)) {
      return res.status(400).json({ error: "dateTo must be YYYY-MM-DD." });
    }

    const todayIST = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
    const monthStart = `${todayIST.slice(0, 7)}-01`;
    dateFrom = dateFrom || cfg.syncStartDate || monthStart;
    dateTo   = dateTo   || todayIST;

    const orders = isDatabaseEnabled()
      ? await queryClosedOrders(tenantId, { dateFrom, dateTo })
      : getSalesForRange(tenantId, dateFrom, dateTo, null);

    const billable = orders.filter(o => o.items?.length && !o.isOnHold);

    const { refreshed } = await getValidToken(cfg);
    if (refreshed) {
      await runWithTenant(tenantId, () =>
        updateOwnerSetupData(d => ({ ...d, zoho: { ...d.zoho, accessToken: cfg.accessToken, expiresAt: cfg.expiresAt } }))
      );
    }

    let pushed = 0, skipped = 0;
    const failures = [];
    for (const order of billable) {
      try {
        const result = await pushSaleReceipt(order, cfg, cfg.taxMap || {});
        if (result.alreadyExists) skipped++;
        else pushed++;
      } catch (err) {
        failures.push({ billNo: order.billNo || order.orderNumber, error: err.message });
      }
      // Light pacing to stay under Zoho Books' API rate limit on larger backfills.
      await new Promise(r => setTimeout(r, 250));
    }

    if (pushed > 0) {
      await runWithTenant(tenantId, () =>
        updateOwnerSetupData(d => ({
          ...d,
          zoho: {
            ...d.zoho,
            lastSyncAt:  new Date().toISOString(),
            totalPushed: (d.zoho?.totalPushed || 0) + pushed,
          },
        }))
      );
    }

    console.log(`[zoho] backfill complete | tenant=${tenantId} | range=${dateFrom}..${dateTo} | total=${billable.length} | pushed=${pushed} | skipped=${skipped} | failed=${failures.length}`);
    res.json({
      ok: true,
      dateFrom, dateTo,
      totalOrders: billable.length,
      pushed, skipped,
      failed: failures.length,
      failures,
    });
  })
);

// ─────────────────────────────────────────────────────────────────────────────
// PRIVATE — Backfill cash-out movements (expenses) since a date into Zoho
// POST /integrations/zoho/backfill-expenses
// Body: { dateFrom?, dateTo? } — both "YYYY-MM-DD", optional.
// Mirrors backfill-sales above. syncStartDate only stops new cash-outs from
// being skipped going forward (see shifts.controller.js) — this walks
// historical cash-out movements for the given range (defaults to
// syncStartDate-or-month-start through today) and pushes any that aren't
// already in Zoho. Safe to re-run: pushExpense looks up the expense by
// reference_number before creating, so already-pushed movements are skipped.
//
// NOTE: movements are sourced from the in-memory/JSON-backed shifts store
// (shifts-store.js), which only retains the 1000 most-recent cash
// movements per tenant (across cash-in AND cash-out). Movements older than
// that cap are no longer available and cannot be backfilled.
// ─────────────────────────────────────────────────────────────────────────────
zohoRouter.post(
  "/backfill-expenses",
  requireAuth,
  asyncHandler(async (req, res) => {
    const tenantId = req.user?.tenantId || "default";
    const data      = await runWithTenant(tenantId, () => getOwnerSetupData());
    const cfg       = data?.zoho;

    if (!cfg?.enabled || !cfg?.refreshToken || !cfg?.organizationId) {
      return res.status(400).json({ error: "Zoho is not connected/enabled." });
    }

    let { dateFrom, dateTo } = req.body || {};
    if (dateFrom && !/^\d{4}-\d{2}-\d{2}$/.test(dateFrom)) {
      return res.status(400).json({ error: "dateFrom must be YYYY-MM-DD." });
    }
    if (dateTo && !/^\d{4}-\d{2}-\d{2}$/.test(dateTo)) {
      return res.status(400).json({ error: "dateTo must be YYYY-MM-DD." });
    }

    const todayIST = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
    const monthStart = `${todayIST.slice(0, 7)}-01`;
    dateFrom = dateFrom || cfg.syncStartDate || monthStart;
    dateTo   = dateTo   || todayIST;

    const { movements } = getShifts(tenantId);
    const cashOuts = movements.filter(m => {
      if (m.type !== "out") return false;
      const d = (m.time || "").slice(0, 10);
      return d >= dateFrom && d <= dateTo;
    });

    const { refreshed } = await getValidToken(cfg);
    if (refreshed) {
      await runWithTenant(tenantId, () =>
        updateOwnerSetupData(d => ({ ...d, zoho: { ...d.zoho, accessToken: cfg.accessToken, expiresAt: cfg.expiresAt } }))
      );
    }

    let pushed = 0, skipped = 0;
    const failures = [];
    for (const movement of cashOuts) {
      try {
        const result = await pushExpense(movement, cfg);
        if (result.alreadyExists) skipped++;
        else pushed++;
      } catch (err) {
        failures.push({ movementId: movement.id, error: err.message });
      }
      // Light pacing to stay under Zoho Books' API rate limit on larger backfills.
      await new Promise(r => setTimeout(r, 250));
    }

    if (pushed > 0) {
      await runWithTenant(tenantId, () =>
        updateOwnerSetupData(d => ({
          ...d,
          zoho: {
            ...d.zoho,
            lastSyncAt:  new Date().toISOString(),
            totalPushed: (d.zoho?.totalPushed || 0) + pushed,
          },
        }))
      );
    }

    console.log(`[zoho] expense backfill complete | tenant=${tenantId} | range=${dateFrom}..${dateTo} | total=${cashOuts.length} | pushed=${pushed} | skipped=${skipped} | failed=${failures.length}`);
    res.json({
      ok: true,
      dateFrom, dateTo,
      totalMovements: cashOuts.length,
      pushed, skipped,
      failed: failures.length,
      failures,
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
