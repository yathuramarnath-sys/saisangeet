const test = require("node:test");
const assert = require("node:assert/strict");

const { ApiError } = require("../src/utils/api-error");

test("ApiError stores status code, code, message, and details", () => {
  const error = new ApiError(403, "INSUFFICIENT_PERMISSION", "Forbidden", {
    permission: "reports.view"
  });

  assert.equal(error.statusCode, 403);
  assert.equal(error.code, "INSUFFICIENT_PERMISSION");
  assert.equal(error.message, "Forbidden");
  assert.deepEqual(error.details, { permission: "reports.view" });
});
