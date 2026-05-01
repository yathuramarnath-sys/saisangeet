const rateLimit = require("express-rate-limit");

/** Standard error response for rate-limited requests */
function rateLimitHandler(_req, res) {
  res.status(429).json({
    error: "TOO_MANY_REQUESTS",
    message: "Too many requests — please try again later.",
  });
}

/**
 * Prefer the real client IP from Cloudflare's header (CF-Connecting-IP),
 * fall back to req.ip which Express resolves via X-Forwarded-For when
 * trust proxy is set (see app.js).  Without this, all users behind
 * Cloudflare would share one rate-limit bucket (the Cloudflare egress IP).
 */
function cloudflareKeyGenerator(req) {
  return req.headers["cf-connecting-ip"] || req.ip;
}

/**
 * Auth endpoints — login, signup, forgot/reset password
 * 10 attempts per 15 minutes per IP
 */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
  keyGenerator: cloudflareKeyGenerator,
});

/**
 * Device link-code resolution — public endpoint, no auth
 * 15 attempts per 10 minutes per IP (generous enough for legitimate use)
 */
const linkCodeLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
  keyGenerator: cloudflareKeyGenerator,
});

/**
 * General API — broad protection against hammering
 * 300 requests per minute per IP
 */
const generalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
  keyGenerator: cloudflareKeyGenerator,
});

module.exports = { authLimiter, linkCodeLimiter, generalLimiter };
