const { body } = require("express-validator");

// ── Create outlet ────────────────────────────────────────────────────────────
const createOutletRules = [
  body("name")
    .trim()
    .notEmpty().withMessage("Outlet name is required")
    .isLength({ max: 150 }).withMessage("Outlet name must be under 150 characters"),

  body("city")
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ max: 100 }).withMessage("City must be under 100 characters"),

  body("state")
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ max: 100 }).withMessage("State must be under 100 characters"),

  body("gstin")
    .optional({ checkFalsy: true })
    .trim()
    .matches(/^[0-9A-Z]{15}$/).withMessage("GSTIN must be exactly 15 alphanumeric characters"),

  body("reportEmail")
    .optional({ checkFalsy: true })
    .trim()
    .isEmail().withMessage("Report email must be a valid email address")
    .isLength({ max: 200 }).withMessage("Report email too long"),
];

// ── Update outlet settings ───────────────────────────────────────────────────
const updateOutletRules = [
  body("name")
    .optional()
    .trim()
    .notEmpty().withMessage("Outlet name cannot be blank")
    .isLength({ max: 150 }).withMessage("Outlet name must be under 150 characters"),

  body("city")
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ max: 100 }).withMessage("City must be under 100 characters"),

  body("gstin")
    .optional({ checkFalsy: true })
    .trim()
    .matches(/^[0-9A-Z]{15}$/).withMessage("GSTIN must be exactly 15 alphanumeric characters"),

  body("reportEmail")
    .optional({ checkFalsy: true })
    .trim()
    .isEmail().withMessage("Report email must be a valid email address")
    .isLength({ max: 200 }).withMessage("Report email too long"),
];

module.exports = { createOutletRules, updateOutletRules };
