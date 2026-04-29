const jwt = require("jsonwebtoken");
const { env } = require("../config/env");
const { runWithTenant } = require("../data/tenant-context");

function authenticate(req, _res, next) {
  const header = req.headers.authorization;

  if (!header || !header.startsWith("Bearer ")) {
    req.user = null;
    return next();
  }

  const token = header.replace("Bearer ", "").trim();

  try {
    req.user = jwt.verify(token, env.jwtSecret);
  } catch (_error) {
    req.user = null;
    return next();
  }

  // Every valid JWT must carry a tenantId — reject any token that doesn't.
  // This prevents cross-tenant data leakage if a token was somehow issued
  // without tenant binding (e.g. an old token or misconfigured issuer).
  if (!req.user.tenantId) {
    req.user = null;
    return next();
  }

  // Wrap the rest of the request in the correct tenant context.
  // All data reads/writes in this request will automatically use
  // the right tenant's file — no changes needed in service code.
  return runWithTenant(req.user.tenantId, () => next());
}

module.exports = { authenticate };
