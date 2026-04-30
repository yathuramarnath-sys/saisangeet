/**
 * validate.js
 * Drop-in middleware that reads express-validator errors from the request
 * and returns a clean 422 before the handler runs.
 *
 * Usage in routes:
 *   router.post("/path", [...rules], validate, asyncHandler(handler))
 */
const { validationResult } = require("express-validator");

function validate(req, res, next) {
  const result = validationResult(req);
  if (result.isEmpty()) return next();

  const details = result.array().map((e) => ({
    field:   e.path  || e.param || "unknown",
    message: e.msg,
  }));

  return res.status(422).json({
    error:   "VALIDATION_ERROR",
    message: "Input validation failed",
    details,
  });
}

module.exports = { validate };
