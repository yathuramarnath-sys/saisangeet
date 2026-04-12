const test = require("node:test");
const assert = require("node:assert/strict");

const { asyncHandler } = require("../src/utils/async-handler");

test("asyncHandler resolves successful handlers", async () => {
  let called = false;
  const wrapped = asyncHandler(async () => {
    called = true;
  });

  wrapped({}, {}, () => {});
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(called, true);
});

test("asyncHandler forwards thrown errors to next", async () => {
  const failure = new Error("boom");
  const wrapped = asyncHandler(async () => {
    throw failure;
  });

  const received = await new Promise((resolve) => {
    wrapped({}, {}, (error) => resolve(error));
  });

  assert.equal(received, failure);
});
