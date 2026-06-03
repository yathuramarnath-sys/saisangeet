/**
 * requireTenant — RULE #1: No data mixing between tenants. Ever.
 *
 * This is the security bridge. Every route that touches ANY data must go
 * through this middleware. It is the hardest possible check:
 *
 *   1. User must be authenticated (valid JWT)
 *   2. Token must contain a tenantId string
 *   3. tenantId must NOT be "default" — "default" is a dev fallback, never
 *      a real production tenant. Blocking it prevents accidental data leakage
 *      if a token is misconfigured.
 *
 * If ANY check fails → 401, request dies, nothing is read or written.
 * No fallback. No "default". No exceptions.
 *
 * Usage:
 *   router.get("/my-data", requireAuth, requireTenant, handler);
 *
 * Or apply to entire router:
 *   router.use(requireAuth, requireTenant);
 */

const { ApiError } = require("../utils/api-error");

function requireTenant(req, _res, next) {
  // Layer 1: must be authenticated
  if (!req.user) {
    return next(new ApiError(401, "AUTH_REQUIRED", "Authentication required"));
  }

  // Layer 2: token must carry a tenantId
  const tenantId = req.user.tenantId;
  if (!tenantId || typeof tenantId !== "string" || !tenantId.trim()) {
    console.error(
      `[SECURITY] requireTenant BLOCKED: user="${req.user.name || "?"}" ` +
      `role="${req.user.role || "?"}" missing tenantId on ${req.method} ${req.path}`
    );
    return next(new ApiError(401, "TENANT_BINDING_MISSING",
      "Token is not bound to a tenant — re-login required"));
  }

  // Layer 3: never allow access under the "default" fallback tenant
  // "default" only exists for local dev / seed data — it is not a real tenant.
  if (tenantId === "default") {
    console.error(
      `[SECURITY] requireTenant BLOCKED: "default" tenantId on ` +
      `${req.method} ${req.path} — this is a dev-only tenant`
    );
    return next(new ApiError(403, "DEFAULT_TENANT_BLOCKED",
      "Access under the default tenant is not permitted in production"));
  }

  return next();
}

module.exports = { requireTenant };
