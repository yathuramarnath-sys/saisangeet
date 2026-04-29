const { listClients, resetClientPassword } = require("./clients.service");
const { ApiError } = require("../../utils/api-error");

async function listClientsHandler(req, res, next) {
  try {
    // Only the platform owner (default tenant, Owner role) may access this
    if (!req.user || req.user.tenantId !== "default" || !(req.user.roles || []).includes("Owner")) {
      throw new ApiError(403, "FORBIDDEN", "Admin access required");
    }
    const clients = await listClients();
    res.json({ clients });
  } catch (err) {
    next(err);
  }
}

async function resetClientPasswordHandler(req, res, next) {
  try {
    if (!req.user || req.user.tenantId !== "default" || !(req.user.roles || []).includes("Owner")) {
      throw new ApiError(403, "FORBIDDEN", "Admin access required");
    }
    const { tenantId } = req.params;
    if (!tenantId) throw new ApiError(400, "MISSING_TENANT", "tenantId is required");

    const result = await resetClientPassword(tenantId);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

module.exports = { listClientsHandler, resetClientPasswordHandler };
