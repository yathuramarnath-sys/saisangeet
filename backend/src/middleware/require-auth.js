const { ApiError } = require("../utils/api-error");

function requireAuth(req, _res, next) {
  if (!req.user) {
    return next(new ApiError(401, "AUTH_REQUIRED", "Authentication is required"));
  }

  // Every valid session must be bound to a tenant.
  // If tenantId is missing the token is malformed or from a legacy issuer —
  // reject immediately so no controller can accidentally fall back to "default".
  if (!req.user.tenantId) {
    return next(new ApiError(401, "TENANT_BINDING_MISSING", "Token is not bound to a tenant"));
  }

  return next();
}

module.exports = {
  requireAuth
};
