const { body } = require("express-validator");

// ── Reusable field rules ──────────────────────────────────────────────────────

const passwordField = (name = "password") =>
  body(name)
    .trim()
    .notEmpty().withMessage("Password is required")
    .isLength({ min: 8, max: 100 }).withMessage("Password must be 8–100 characters");

const identifierField = (name = "identifier") =>
  body(name)
    .trim()
    .notEmpty().withMessage("Email or phone is required")
    .isLength({ max: 200 }).withMessage("Identifier too long");

// ── Signup ───────────────────────────────────────────────────────────────────
const signupRules = [
  body("fullName")
    .trim()
    .notEmpty().withMessage("Full name is required")
    .isLength({ max: 100 }).withMessage("Full name must be under 100 characters"),

  body("email")
    .trim()
    .notEmpty().withMessage("Email is required")
    .isEmail().withMessage("Must be a valid email address")
    .normalizeEmail()
    .isLength({ max: 200 }).withMessage("Email too long"),

  body("phone")
    .optional({ checkFalsy: true })
    .trim()
    .matches(/^[0-9+\-\s()]{7,20}$/).withMessage("Phone number format is invalid"),

  body("businessName")
    .trim()
    .notEmpty().withMessage("Restaurant name is required")
    .isLength({ max: 150 }).withMessage("Restaurant name must be under 150 characters"),

  passwordField("password"),
];

// ── Login ────────────────────────────────────────────────────────────────────
const loginRules = [
  identifierField("identifier"),
  body("password")
    .notEmpty().withMessage("Password is required")
    .isLength({ max: 200 }).withMessage("Password too long"),
];

// ── Forgot password ──────────────────────────────────────────────────────────
const forgotPasswordRules = [
  identifierField("identifier"),
];

// ── Reset password (token-based, public endpoint) ────────────────────────────
const resetPasswordRules = [
  body("token")
    .trim()
    .notEmpty().withMessage("Reset token is required")
    .isLength({ max: 500 }).withMessage("Token too long"),

  passwordField("newPassword"),
];

// ── Change password (authenticated) ──────────────────────────────────────────
const changePasswordRules = [
  body("currentPassword")
    .notEmpty().withMessage("Current password is required")
    .isLength({ max: 200 }).withMessage("Current password too long"),

  passwordField("newPassword"),
];

module.exports = {
  signupRules,
  loginRules,
  forgotPasswordRules,
  resetPasswordRules,
  changePasswordRules,
};
