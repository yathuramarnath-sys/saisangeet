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

  // Wrap the rest of the request in the correct tenant context.
  // All data reads/writes in this request will automatically use
  // the right tenant's file — no changes needed in service code.
  const tenantId = req.user.tenantId || "default";
  return runWithTenant(tenantId, () => next());
}

module.exports = { authenticate };
