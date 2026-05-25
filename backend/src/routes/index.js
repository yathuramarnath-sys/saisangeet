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
const { discountsRouter } = require("../modules/discounts/discounts.routes");
const { integrationsRouter } = require("../modules/integrations/integrations.routes");
const { operationsRouter } = require("../modules/operations/operations.routes");
const { reportsRouter } = require("../modules/reports/reports.routes");
const { shiftsRouter } = require("../modules/shifts/shifts.routes");
const { setupRouter } = require("../modules/setup/setup.routes");
const { kitchenRouter } = require("../modules/kitchen/kitchen.routes");
const wastageRouter     = require("../modules/operations/wastage.routes");
const waitlistRouter    = require("../modules/operations/waitlist.routes");
const { clientsRouter } = require("../modules/clients/clients.routes");
const { billingRouter }    = require("../modules/billing/billing.routes");
const { whatsappRouter }   = require("../modules/whatsapp/whatsapp.routes");
const { counterRouter }    = require("../modules/counter/counter.routes");
const { onlineOrdersRouter } = require("../modules/online-orders/online-orders.routes");
const { phonePeRouter }      = require("../modules/phonepe/phonepe.routes");
const { borzoRouter }        = require("../modules/borzo/borzo.routes");
const { zohoRouter }         = require("../modules/zoho/zoho.routes");
const { settlementsRouter }  = require("../modules/settlements/settlements.routes");
const { inventoryRouter }    = require("../modules/inventory/inventory.routes");
const { advanceOrdersRouter } = require("../modules/advance-orders/advance-orders.routes");
const { backupRouter }        = require("../modules/backup/backup.routes");
const { requireAuth }      = require("../middleware/require-auth");
const { asyncHandler }  = require("../utils/async-handler");
const { updateOwnerSetupDataNow, getOwnerSetupData } = require("../data/owner-setup-store");

const apiRouter = express.Router();

// ── Public: app version manifest — no auth needed ─────────────────────────────
// Returns current versions for all Plato apps so clients can show update banners.
// Serves app version manifest for update banners on all POS/Captain/KDS apps.
// Priority:
//   1. .data/app-versions.json  — runtime override (Railway persistent volume, or local dev)
//   2. src/app-versions.json    — committed fallback (always present after any deploy)
// To release a new version: update src/app-versions.json and deploy — no volume needed.
apiRouter.get("/app-versions", (_req, res) => {
  const fs   = require("fs");
  const path = require("path");
  const runtimePath   = path.resolve(__dirname, "../../.data/app-versions.json");
  const committedPath = path.resolve(__dirname, "../app-versions.json");
  try {
    const filePath = fs.existsSync(runtimePath) ? runtimePath : committedPath;
    const raw      = fs.readFileSync(filePath, "utf8");
    res.json(JSON.parse(raw));
  } catch {
    res.json({});
  }
});

apiRouter.use(authenticate);
apiRouter.use("/auth", authRouter);
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
apiRouter.use("/operations/wastage",   wastageRouter);
apiRouter.use("/operations/waitlist",  waitlistRouter);
apiRouter.use("/admin/clients", clientsRouter);
apiRouter.use("/billing",        billingRouter);
apiRouter.use("/whatsapp",       whatsappRouter);
apiRouter.use("/counter",        counterRouter);
apiRouter.use("/online-orders",    onlineOrdersRouter);
apiRouter.use("/payments/phonepe", phonePeRouter);
apiRouter.use("/delivery/borzo",   borzoRouter);
apiRouter.use("/integrations/zoho", zohoRouter);
apiRouter.use("/settlements",        settlementsRouter);
apiRouter.use("/inventory",          inventoryRouter);
apiRouter.use("/advance-orders",     advanceOrdersRouter);
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
