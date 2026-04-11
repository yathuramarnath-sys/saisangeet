const jwt = require("jsonwebtoken");

const { env } = require("../../config/env");
const { ApiError } = require("../../utils/api-error");
const { findUserByIdentifier } = require("./auth.repository");

async function login({ identifier, password }) {
  const user = await findUserByIdentifier(identifier);

  if (!user || user.status !== "active") {
    throw new ApiError(401, "AUTH_INVALID_CREDENTIALS", "Invalid credentials");
  }

  if (user.passwordHash !== password) {
    throw new ApiError(401, "AUTH_INVALID_CREDENTIALS", "Invalid credentials");
  }

  const tokenPayload = {
    sub: user.id,
    outletId: user.outletId,
    roles: user.roles,
    permissions: user.permissions
  };

  const token = jwt.sign(tokenPayload, env.jwtSecret, { expiresIn: "8h" });

  return {
    token,
    refreshToken: "replace-with-refresh-token-flow",
    user: {
      id: user.id,
      fullName: user.fullName,
      outletId: user.outletId,
      roles: user.roles,
      permissions: user.permissions
    }
  };
}

module.exports = {
  login
};
