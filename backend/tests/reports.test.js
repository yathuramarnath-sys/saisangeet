const test = require("node:test");
const assert = require("node:assert/strict");

const {
  fetchOwnerSummary,
  approveClosing,
  reopenBusinessDay
} = require("../src/modules/reports/reports.service");
const { reportsRouter } = require("../src/modules/reports/reports.routes");
const { resetState } = require("../src/modules/operations/operations.memory-store");

test.beforeEach(() => {
  resetState();
});

test("owner summary returns approval log and control cards", async () => {
  const payload = await fetchOwnerSummary();

  assert.equal(payload.controlSummary.length, 6);
  assert.equal(payload.closingCenter.ownerSummary.length, 4);
  assert.ok(Array.isArray(payload.approvalLog));
  assert.ok(Array.isArray(payload.controlLogs.reprints));
  assert.equal(payload.popupAlert.cta, "Open reports");
});

test("approve closing updates backend closing state", async () => {
  const payload = await approveClosing({
    name: "Manager Rakesh",
    role: "Manager"
  });

  assert.equal(payload.closingState.approved, true);
  assert.equal(payload.closingState.approvedBy, "Manager Rakesh");
  assert.equal(payload.popupAlert.title, "Daily closing approved");
});

test("reopen business day clears approved closing state", async () => {
  await approveClosing({
    name: "Owner",
    role: "Owner"
  });

  const payload = await reopenBusinessDay({
    name: "Owner",
    role: "Owner"
  });

  assert.equal(payload.closingState.approved, false);
  assert.equal(payload.closingState.reopenedBy, "Owner");
  assert.equal(payload.closingState.status, "Open for operations");
});

test("reports routes register owner summary and closing actions", () => {
  const routes = reportsRouter.stack
    .filter((layer) => layer.route)
    .map((layer) => ({
      path: layer.route.path,
      methods: Object.keys(layer.route.methods)
    }));

  assert.deepEqual(routes, [
    { path: "/owner-summary", methods: ["get"] },
    { path: "/closing/approve", methods: ["post"] },
    { path: "/closing/reopen", methods: ["post"] }
  ]);
});
