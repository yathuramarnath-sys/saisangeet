const rateLimit = require("express-rate-limit");

/** Standard error response for rate-limited requests */
function rateLimitHandler(_req, res) {
  res.status(429).json({
    error: "TOO_MANY_REQUESTS",
    message: "Too many requests — please try again later.",
  });
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
});

module.exports = { authLimiter, linkCodeLimiter, generalLimiter };
