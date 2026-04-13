const test = require("node:test");
const assert = require("node:assert/strict");

const {
  fetchShiftSummary,
  reviewCashMismatch
} = require("../src/modules/shifts/shifts.service");
const { shiftsRouter } = require("../src/modules/shifts/shifts.routes");
const { resetState } = require("../src/modules/operations/operations.memory-store");

test.beforeEach(() => {
  resetState();
});

test("shift summary returns shifts, movements, and alerts", async () => {
  const payload = await fetchShiftSummary();

  assert.equal(payload.shifts.length, 4);
  assert.equal(payload.movements.length, 3);
  assert.equal(payload.alerts.length, 3);
});

test("review cash mismatch updates the mismatch shift and alert", async () => {
  const payload = await reviewCashMismatch();
  const reviewedShift = payload.shifts.find((shift) => shift.id === "ramesh-hsr");
  const reviewedAlert = payload.alerts.find((alert) => alert.id === "hsr-short");

  assert.equal(reviewedShift.status, "Manager check");
  assert.equal(reviewedAlert.title, "HSR Layout mismatch under manager review");
});

test("shifts routes register summary and review actions", () => {
  const routes = shiftsRouter.stack
    .filter((layer) => layer.route)
    .map((layer) => ({
      path: layer.route.path,
      methods: Object.keys(layer.route.methods)
    }));

  assert.deepEqual(routes, [
    { path: "/summary", methods: ["get"] },
    { path: "/mismatch/review", methods: ["post"] }
  ]);
});
