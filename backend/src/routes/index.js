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
const { clientsRouter } = require("../modules/clients/clients.routes");
const { billingRouter } = require("../modules/billing/billing.routes");

const apiRouter = express.Router();

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
apiRouter.use("/admin/clients", clientsRouter);
apiRouter.use("/billing",       billingRouter);

module.exports = {
  apiRouter
};
