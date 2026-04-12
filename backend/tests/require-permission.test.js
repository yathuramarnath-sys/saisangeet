const test = require("node:test");
const assert = require("node:assert/strict");

const { requirePermission } = require("../src/middleware/require-permission");

test("requirePermission allows request when permission is present", async () => {
  const middleware = requirePermission("reports.view");
  const req = {
    user: {
      permissions: ["reports.view", "devices.manage"]
    }
  };

  const nextArg = await new Promise((resolve) => {
    middleware(req, {}, (error) => resolve(error));
  });

  assert.equal(nextArg, undefined);
});

test("requirePermission rejects request when permission is missing", async () => {
  const middleware = requirePermission("reports.view");
  const req = {
    user: {
      permissions: ["devices.manage"]
    }
  };

  const error = await new Promise((resolve) => {
    middleware(req, {}, (nextError) => resolve(nextError));
  });

  assert.equal(error.statusCode, 403);
  assert.equal(error.code, "INSUFFICIENT_PERMISSION");
});
