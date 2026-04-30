const { body } = require("express-validator");

// ── Create staff user ────────────────────────────────────────────────────────
const createUserRules = [
  body("fullName")
    .trim()
    .notEmpty().withMessage("Full name is required")
    .isLength({ max: 100 }).withMessage("Full name must be under 100 characters"),

  body("email")
    .optional({ checkFalsy: true })
    .trim()
    .isEmail().withMessage("Must be a valid email address")
    .normalizeEmail()
    .isLength({ max: 200 }).withMessage("Email too long"),

  body("phone")
    .optional({ checkFalsy: true })
    .trim()
    .matches(/^[0-9+\-\s()]{7,20}$/).withMessage("Phone number format is invalid"),

  body("roles")
    .optional()
    .isArray().withMessage("Roles must be an array"),

  body("roles.*")
    .optional()
    .trim()
    .isLength({ max: 50 }).withMessage("Role name too long"),

  body("pin")
    .optional({ checkFalsy: true })
    .trim()
    .matches(/^[0-9]{4,6}$/).withMessage("PIN must be 4–6 digits"),
];

// ── Update staff user ────────────────────────────────────────────────────────
const updateUserRules = [
  body("fullName")
    .optional()
    .trim()
    .notEmpty().withMessage("Full name cannot be blank")
    .isLength({ max: 100 }).withMessage("Full name must be under 100 characters"),

  body("email")
    .optional({ checkFalsy: true })
    .trim()
    .isEmail().withMessage("Must be a valid email address")
    .normalizeEmail()
    .isLength({ max: 200 }).withMessage("Email too long"),

  body("phone")
    .optional({ checkFalsy: true })
    .trim()
    .matches(/^[0-9+\-\s()]{7,20}$/).withMessage("Phone number format is invalid"),

  body("roles")
    .optional()
    .isArray().withMessage("Roles must be an array"),

  body("pin")
    .optional({ checkFalsy: true })
    .trim()
    .matches(/^[0-9]{4,6}$/).withMessage("PIN must be 4–6 digits"),
];

module.exports = { createUserRules, updateUserRules };
