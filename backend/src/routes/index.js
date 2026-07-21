const express = require("express");

const { authenticate } = require("../middleware/authenticate");
const { authRouter } = require("../modules/auth/auth.routes");
const { businessProfileRouter } = require("../modules/business-profile/business-profile.routes");
const { menuRouter } = require("../modules/menu/menu.routes");
const { outletsRouter } = require("../modules/outlets/outlets.routes");
const { rolesRouter } = require("../modules/roles/roles.routes");
const { permissionsRouter } = require("../modules/permissions/permissions.routes");
const { usersRouter } = require("../modules/users/users.routes");
const { taxProfilesRouter } = require("../modules/tax-profiles/tax-profiles.routes");
const { receiptTemplatesRouter } = require("../modules/receipt-templates/receipt-templates.routes");
const { devicesRouter } = require("../modules/devices/devices.routes");
const { resolveLinkCodeHandler } = require("../modules/devices/devices.controller");
const { resolveLinkCodeRules } = require("../validators/devices.validators");
const { validate } = require("../middleware/validate");
const { linkCodeLimiter } = require("../middleware/rate-limit");
const { discountsRouter } = require("../modules/discounts/discounts.routes");
const { integrationsRouter } = require("../modules/integrations/integrations.routes");
const { operationsRouter } = require("../modules/operations/operations.routes");
const { reportsRouter } = require("../modules/reports/reports.routes");
const { shiftsRouter } = require("../modules/shifts/shifts.routes");
const { setupRouter } = require("../modules/setup/setup.routes");
const { kitchenRouter } = require("../modules/kitchen/kitchen.routes");
const wastageRouter        = require("../modules/operations/wastage.routes");
const waitlistRouter       = require("../modules/operations/waitlist.routes");
const customerOrderRouter  = require("../modules/operations/customer-order.routes");
const { publicRouter }     = require("../modules/public/public.routes");
const { clientsRouter } = require("../modules/clients/clients.routes");
const { restoreRouter } = require("../modules/restore/restore.routes");
const { billingRouter }    = require("../modules/billing/billing.routes");
const { whatsappRouter }   = require("../modules/whatsapp/whatsapp.routes");
const { counterRouter }    = require("../modules/counter/counter.routes");
const { onlineOrdersRouter } = require("../modules/online-orders/online-orders.routes");
const { phonePeRouter }      = require("../modules/phonepe/phonepe.routes");
const { paytmRouter }        = require("../modules/paytm/paytm.routes");
const { borzoRouter }        = require("../modules/borzo/borzo.routes");
const { zohoRouter, handleZohoCallback } = require("../modules/zoho/zoho.routes");
const { settlementsRouter }  = require("../modules/settlements/settlements.routes");
const { inventoryRouter }    = require("../modules/inventory/inventory.routes");
const { advanceOrdersRouter } = require("../modules/advance-orders/advance-orders.routes");
const { customersRouter }     = require("../modules/customers/customers.routes");
const { backupRouter }        = require("../modules/backup/backup.routes");
const { requireAuth }   = require("../middleware/require-auth");
const { requireTenant } = require("../middleware/require-tenant");
const { asyncHandler }  = require("../utils/async-handler");
const { updateOwnerSetupDataNow, getOwnerSetupData } = require("../data/owner-setup-store");

const apiRouter = express.Router();

// ── Public: customer QR menu + outlet info — no auth needed ──────────────────
apiRouter.use("/public", publicRouter);

// ── Public: app version manifest — no auth needed ─────────────────────────────
// Returns current versions for all Plato apps so clients can show update banners.
// Serves app version manifest for update banners on all POS/Captain/KDS apps.
// Always uses src/app-versions.json (committed). Update it and deploy to release a new version.
apiRouter.get("/app-versions", (_req, res) => {
  const fs   = require("fs");
  const path = require("path");
  const committedPath = path.resolve(__dirname, "../app-versions.json");
  try {
    const raw = fs.readFileSync(committedPath, "utf8");
    res.json(JSON.parse(raw));
  } catch {
    res.json({});
  }
});

// ── RULE #1: NO DATA MIXING ──────────────────────────────────────────────────
// authenticate   → sets tenant context from JWT (AsyncLocalStorage)
// requireTenant  → hard-blocks any request without a verified, non-default tenantId
//
// These two run BEFORE every data route. Exceptions (auth + public) are mounted
// above. Nothing below this line can accidentally touch another tenant's data.
apiRouter.use(authenticate);

// /auth — login/register handled before requireTenant so users can log in.
// Auth routes verify identity — they do not read tenant-specific data.
apiRouter.use("/auth", authRouter);

// Admin console — default-tenant owner only; mounted before requireTenant
// because requireTenant blocks tenantId === "default".
apiRouter.use("/admin/clients", clientsRouter);

// TEMPORARY: emergency restore endpoint — remove after use
apiRouter.use("/admin/restore-backup", restoreRouter);

// Public device route — POS terminal setup, no auth required.
// Must be mounted before requireTenant so devices can link without a JWT.
apiRouter.post("/devices/resolve-link-code", linkCodeLimiter, resolveLinkCodeRules, validate, asyncHandler(resolveLinkCodeHandler));

// Public Zoho OAuth callback — Zoho redirects here with no JWT attached.
// Must be mounted before requireTenant for the same reason as above.
apiRouter.get("/integrations/zoho/callback", handleZohoCallback);

// ── All data routes — MUST pass requireTenant ─────────────────────────────
// requireTenant guarantees: valid JWT + tenantId present + not "default".
// Any request that fails this check is rejected with 401 before any service
// code runs. This is the security bridge — it cannot be bypassed.
apiRouter.use(requireTenant);

apiRouter.use("/business-profile", businessProfileRouter);
apiRouter.use("/menu", menuRouter);
apiRouter.use("/outlets", outletsRouter);
apiRouter.use("/roles", rolesRouter);
apiRouter.use("/permissions", permissionsRouter);
apiRouter.use("/users", usersRouter);
apiRouter.use("/settings/tax-profiles", taxProfilesRouter);
apiRouter.use("/settings/receipt-templates", receiptTemplatesRouter);
apiRouter.use("/devices", devicesRouter);
apiRouter.use("/settings/discounts", discountsRouter);
apiRouter.use("/integrations", integrationsRouter);
apiRouter.use("/operations", operationsRouter);
apiRouter.use("/reports", reportsRouter);
apiRouter.use("/shifts", shiftsRouter);
apiRouter.use("/setup", setupRouter);
apiRouter.use("/kitchen-stations", kitchenRouter);
apiRouter.use("/operations/wastage",        wastageRouter);
apiRouter.use("/operations/waitlist",       waitlistRouter);
apiRouter.use("/operations/customer-order", customerOrderRouter);
apiRouter.use("/billing",        billingRouter);
apiRouter.use("/whatsapp",       whatsappRouter);
apiRouter.use("/counter",        counterRouter);
apiRouter.use("/online-orders",    onlineOrdersRouter);
apiRouter.use("/payments/phonepe", phonePeRouter);
apiRouter.use("/payments/paytm",   paytmRouter);
apiRouter.use("/delivery/borzo",   borzoRouter);
apiRouter.use("/integrations/zoho", zohoRouter);
apiRouter.use("/settlements",        settlementsRouter);
apiRouter.use("/inventory",          inventoryRouter);
apiRouter.use("/advance-orders",     advanceOrdersRouter);
apiRouter.use("/customers",          customersRouter);
apiRouter.use("/backup",             backupRouter);

// ── GET /settings/security — fetch current security settings (PIN masked) ────
apiRouter.get("/settings/security", requireAuth, asyncHandler(async (_req, res) => {
  const data = getOwnerSetupData();
  const pin  = data?.security?.managerPin || "";
  // Never return the actual PIN — just tell the client whether one is set
  res.json({ managerPinSet: pin.length > 0 });
}));

// ── PUT /settings/security — update manager PIN ───────────────────────────────
// Body: { managerPin: "1234" }  (4–6 digits)
apiRouter.put("/settings/security", requireAuth, asyncHandler(async (req, res) => {
  const { managerPin } = req.body || {};
  const pin = String(managerPin || "").trim();

  if (pin && !/^\d{4,6}$/.test(pin)) {
    return res.status(400).json({
      error: "INVALID_PIN",
      message: "Manager PIN must be 4–6 digits."
    });
  }

  await updateOwnerSetupDataNow((data) => ({
    ...data,
    security: { ...(data.security || {}), managerPin: pin }
  }));

  res.json({ ok: true, managerPinSet: pin.length > 0 });
}));

module.exports = {
  apiRouter
};
