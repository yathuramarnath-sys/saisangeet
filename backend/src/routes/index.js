const express = require("express");

const { authenticate } = require("../middleware/authenticate");
const { authRouter } = require("../modules/auth/auth.routes");
const { businessProfileRouter } = require("../modules/business-profile/business-profile.routes");
const { outletsRouter } = require("../modules/outlets/outlets.routes");
const { rolesRouter } = require("../modules/roles/roles.routes");
const { permissionsRouter } = require("../modules/permissions/permissions.routes");
const { usersRouter } = require("../modules/users/users.routes");
const { taxProfilesRouter } = require("../modules/tax-profiles/tax-profiles.routes");
const { receiptTemplatesRouter } = require("../modules/receipt-templates/receipt-templates.routes");
const { devicesRouter } = require("../modules/devices/devices.routes");

const apiRouter = express.Router();

apiRouter.use(authenticate);
apiRouter.use("/auth", authRouter);
apiRouter.use("/business-profile", businessProfileRouter);
apiRouter.use("/outlets", outletsRouter);
apiRouter.use("/roles", rolesRouter);
apiRouter.use("/permissions", permissionsRouter);
apiRouter.use("/users", usersRouter);
apiRouter.use("/settings/tax-profiles", taxProfilesRouter);
apiRouter.use("/settings/receipt-templates", receiptTemplatesRouter);
apiRouter.use("/devices", devicesRouter);

module.exports = {
  apiRouter
};
