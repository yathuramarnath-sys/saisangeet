const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const { env } = require("../../config/env");
const { ApiError } = require("../../utils/api-error");
const { findUserByIdentifier } = require("./auth.repository");

async function login({ identifier, password }) {
  if (!identifier || !password) {
    throw new ApiError(400, "AUTH_MISSING_FIELDS", "Identifier and password are required");
  }

  const user = await findUserByIdentifier(identifier);

  if (!user || user.status !== "active") {
    throw new ApiError(401, "AUTH_INVALID_CREDENTIALS", "Invalid credentials");
  }

  const passwordMatch = await bcrypt.compare(String(password), user.passwordHash);
  if (!passwordMatch) {
    throw new ApiError(401, "AUTH_INVALID_CREDENTIALS", "Invalid credentials");
  }

  const tokenPayload = {
    sub: user.id,
    outletId: user.outletId,
    fullName: user.fullName,
    roles: user.roles,
    permissions: user.permissions
  };

  const token = jwt.sign(tokenPayload, env.jwtSecret, { expiresIn: "8h" });

  return {
    token,
    user: {
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      phone: user.phone,
      outletId: user.outletId,
      roles: user.roles,
      permissions: user.permissions
    }
  };
}

module.exports = {
  login
};
