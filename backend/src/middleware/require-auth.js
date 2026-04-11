const { ApiError } = require("../utils/api-error");

function requireAuth(req, _res, next) {
  if (!req.user) {
    return next(new ApiError(401, "AUTH_REQUIRED", "Authentication is required"));
  }

  return next();
}

module.exports = {
  requireAuth
};
