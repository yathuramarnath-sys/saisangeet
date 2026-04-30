const { body } = require("express-validator");

// ── Resolve link code (PUBLIC endpoint — no auth) ─────────────────────────────
// Strict: only uppercase letters, digits, and hyphens. 3–30 chars.
// Prevents garbage/oversized input from hitting the DB lookup.
const resolveLinkCodeRules = [
  body("linkCode")
    .trim()
    .toUpperCase()
    .notEmpty().withMessage("Link code is required")
    .isLength({ min: 3, max: 30 }).withMessage("Link code must be 3–30 characters")
    .matches(/^[A-Z0-9-]+$/).withMessage("Link code may only contain letters, digits, and hyphens"),
];

// ── Create link token (authenticated — owner web) ────────────────────────────
const createLinkTokenRules = [
  body("outletCode")
    .trim()
    .notEmpty().withMessage("Outlet code is required")
    .isLength({ max: 30 }).withMessage("Outlet code too long")
    .matches(/^[A-Z0-9-]+$/i).withMessage("Outlet code may only contain letters, digits, and hyphens"),

  body("outletId")
    .trim()
    .notEmpty().withMessage("Outlet ID is required")
    .isLength({ max: 100 }).withMessage("Outlet ID too long"),
];

module.exports = { resolveLinkCodeRules, createLinkTokenRules };
