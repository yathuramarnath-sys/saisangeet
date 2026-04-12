const test = require("node:test");
const assert = require("node:assert/strict");

const { notFoundHandler } = require("../src/middleware/not-found");

test("notFoundHandler returns route not found response", () => {
  let statusCode;
  let payload;

  const res = {
    status(code) {
      statusCode = code;
      return this;
    },
    json(body) {
      payload = body;
      return this;
    }
  };

  notFoundHandler({ method: "GET", originalUrl: "/missing" }, res);

  assert.equal(statusCode, 404);
  assert.equal(payload.error.code, "ROUTE_NOT_FOUND");
  assert.match(payload.error.message, /GET \/missing/);
});
