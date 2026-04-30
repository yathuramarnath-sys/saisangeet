const { body } = require("express-validator");

// ── Create / update menu item ────────────────────────────────────────────────
const createItemRules = [
  body("name")
    .trim()
    .notEmpty().withMessage("Item name is required")
    .isLength({ max: 150 }).withMessage("Item name must be under 150 characters"),

  body("price")
    .optional({ checkFalsy: true })
    .isFloat({ min: 0 }).withMessage("Price must be a positive number"),

  body("categoryId")
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ max: 100 }).withMessage("Category ID too long"),

  body("unit")
    .optional({ checkFalsy: true })
    .trim()
    .isIn(["", "PCS", "KG", "LTR"]).withMessage("Unit must be PCS, KG, or LTR"),
];

const updateItemRules = [
  body("name")
    .optional()
    .trim()
    .notEmpty().withMessage("Item name cannot be blank")
    .isLength({ max: 150 }).withMessage("Item name must be under 150 characters"),

  body("price")
    .optional({ checkFalsy: true })
    .isFloat({ min: 0 }).withMessage("Price must be a positive number"),

  body("unit")
    .optional({ checkFalsy: true })
    .trim()
    .isIn(["", "PCS", "KG", "LTR"]).withMessage("Unit must be PCS, KG, or LTR"),
];

// ── Create / update category ─────────────────────────────────────────────────
const createCategoryRules = [
  body("name")
    .trim()
    .notEmpty().withMessage("Category name is required")
    .isLength({ max: 100 }).withMessage("Category name must be under 100 characters"),
];

const updateCategoryRules = [
  body("name")
    .optional()
    .trim()
    .notEmpty().withMessage("Category name cannot be blank")
    .isLength({ max: 100 }).withMessage("Category name must be under 100 characters"),
];

// ── Bulk import ──────────────────────────────────────────────────────────────
const bulkImportRules = [
  body("items")
    .isArray({ min: 1, max: 500 }).withMessage("items must be an array of 1–500 entries"),

  body("items.*.name")
    .trim()
    .notEmpty().withMessage("Each item must have a name")
    .isLength({ max: 150 }).withMessage("Item name must be under 150 characters"),

  body("items.*.price")
    .optional({ checkFalsy: true })
    .isFloat({ min: 0 }).withMessage("Item price must be a positive number"),
];

module.exports = {
  createItemRules,
  updateItemRules,
  createCategoryRules,
  updateCategoryRules,
  bulkImportRules,
};
