const { ApiError } = require("../utils/api-error");

function requirePermission(permissionCode) {
  return (req, _res, next) => {
    const permissions = req.user?.permissions || [];

    if (!req.user) {
      return next(new ApiError(401, "AUTH_REQUIRED", "Authentication is required"));
    }

    if (!permissions.includes(permissionCode)) {
      return next(
        new ApiError(
          403,
          "INSUFFICIENT_PERMISSION",
          `Missing required permission: ${permissionCode}`
        )
      );
    }

    return next();
  };
}

module.exports = {
  requirePermission
};
