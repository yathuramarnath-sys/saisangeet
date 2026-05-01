const { body } = require("express-validator");

// ── Create KOT ───────────────────────────────────────────────────────────────
// NOTE: POS and Captain send items as { id, name, quantity, price, note }
// (NOT itemId / qty). Keep item-level validation loose — the handler maps
// whatever fields are present into the KOT record.
const createKotRules = [
  body("outletId")
    .trim()
    .notEmpty().withMessage("Outlet ID is required")
    .isLength({ max: 100 }).withMessage("Outlet ID too long"),

  body("items")
    .isArray({ min: 1 }).withMessage("At least one item is required"),

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
// deviceCloseOrderHandler receives { outletId, order } — orderId is embedded
// inside the order object, not a top-level field. Only validate what's always present.
const closeOrderRules = [
  body("outletId")
    .trim()
    .notEmpty().withMessage("Outlet ID is required")
    .isLength({ max: 100 }).withMessage("Outlet ID too long"),

  body("order")
    .notEmpty().withMessage("Order is required"),
];

module.exports = { createKotRules, closeOrderRules };
