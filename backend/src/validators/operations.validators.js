const { body } = require("express-validator");

// ── Create KOT ───────────────────────────────────────────────────────────────
const createKotRules = [
  body("outletId")
    .trim()
    .notEmpty().withMessage("Outlet ID is required")
    .isLength({ max: 100 }).withMessage("Outlet ID too long"),

  body("items")
    .isArray({ min: 1 }).withMessage("At least one item is required"),

  body("items.*.itemId")
    .trim()
    .notEmpty().withMessage("Each item must have an itemId")
    .isLength({ max: 100 }).withMessage("Item ID too long"),

  body("items.*.qty")
    .isInt({ min: 1, max: 999 }).withMessage("Item quantity must be 1–999"),

  body("tableId")
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ max: 100 }).withMessage("Table ID too long"),

  body("tableNumber")
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ max: 50 }).withMessage("Table number too long"),
];

// ── Close / bill order ───────────────────────────────────────────────────────
const closeOrderRules = [
  body("outletId")
    .trim()
    .notEmpty().withMessage("Outlet ID is required")
    .isLength({ max: 100 }).withMessage("Outlet ID too long"),

  body("orderId")
    .trim()
    .notEmpty().withMessage("Order ID is required")
    .isLength({ max: 100 }).withMessage("Order ID too long"),

  body("paymentMode")
    .optional({ checkFalsy: true })
    .trim()
    .isIn(["cash", "card", "upi", "other", "split"]).withMessage("Invalid payment mode"),

  body("totalAmount")
    .optional()
    .isFloat({ min: 0 }).withMessage("Total amount must be a positive number"),
];

module.exports = { createKotRules, closeOrderRules };
