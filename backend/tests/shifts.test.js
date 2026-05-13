const test = require("node:test");
const assert = require("node:assert/strict");

const {
  fetchShiftSummary,
  startShift,
  addMovement,
  endShift
} = require("../src/modules/shifts/shifts.service");
const { shiftsRouter } = require("../src/modules/shifts/shifts.routes");
const { resetStateForTest } = require("../src/modules/operations/operations.memory-store");

// Each test gets a clean operations state and a fresh tenant so shifts don't bleed across tests.
let _testTenant = 0;
function nextTenant() { return `test-tenant-${++_testTenant}`; }

test.beforeEach(() => {
  resetStateForTest();
});

test("shift summary returns empty store on first boot", async () => {
  const tenantId = nextTenant();
  const payload = await fetchShiftSummary(tenantId);

  assert.ok(Array.isArray(payload.active),    "active should be an array");
  assert.ok(Array.isArray(payload.history),   "history should be an array");
  assert.ok(Array.isArray(payload.movements), "movements should be an array");
  assert.equal(payload.active.length,    0, "no active shifts on clean boot");
  assert.equal(payload.history.length,   0, "no history shifts on clean boot");
  assert.equal(payload.movements.length, 0, "no movements on clean boot");
});

test("open shift appears in active list", async () => {
  const tenantId = nextTenant();

  await startShift(tenantId, {
    id: "shift-arjun-1",
    cashierName: "Arjun",
    outletName:  "Koramangala",
    openingCash: 5000,
    startedAt:   new Date().toISOString()
  });

  const payload = await fetchShiftSummary(tenantId);
  assert.equal(payload.active.length, 1);
  assert.equal(payload.active[0].id, "shift-arjun-1");
  assert.equal(payload.active[0].cashierName, "Arjun");
});

test("cash movement is recorded and totals update on the active shift", async () => {
  const tenantId = nextTenant();

  await startShift(tenantId, {
    id: "shift-priya-1",
    cashierName: "Priya",
    outletName:  "Indiranagar",
    openingCash: 8000,
    startedAt:   new Date().toISOString()
  });

  await addMovement(tenantId, {
    id: "mov-1", shiftId: "shift-priya-1",
    type: "in", amount: 1500, note: "Top-up", recordedAt: new Date().toISOString()
  });
  await addMovement(tenantId, {
    id: "mov-2", shiftId: "shift-priya-1",
    type: "out", amount: 500, note: "Change", recordedAt: new Date().toISOString()
  });

  const payload = await fetchShiftSummary(tenantId);
  assert.equal(payload.movements.length, 2);
  const shift = payload.active.find(s => s.id === "shift-priya-1");
  assert.ok(shift, "active shift should still be present");
  assert.equal(shift.cashIn,  1500, "cashIn should be updated");
  assert.equal(shift.cashOut, 500,  "cashOut should be updated");
});

test("closing a shift moves it from active to history", async () => {
  const tenantId = nextTenant();

  await startShift(tenantId, {
    id: "shift-manoj-1",
    cashierName: "Manoj",
    outletName:  "Whitefield",
    openingCash: 7000,
    startedAt:   new Date().toISOString()
  });

  await endShift(tenantId, {
    id: "shift-manoj-1", cashierName: "Manoj", outletName: "Whitefield",
    openingCash: 7000, closingCash: 7200,
    closedAt: new Date().toISOString(), status: "Closed"
  });

  const payload = await fetchShiftSummary(tenantId);
  assert.equal(payload.active.length,  0, "active list should be empty after close");
  assert.equal(payload.history.length, 1, "closed shift should appear in history");
  assert.equal(payload.history[0].id,  "shift-manoj-1");
  assert.equal(payload.history[0].status, "Closed");
});

test("shifts routes register summary, open, movement, close and review actions", () => {
  const routes = shiftsRouter.stack
    .filter((layer) => layer.route)
    .map((layer) => ({
      path: layer.route.path,
      methods: Object.keys(layer.route.methods)
    }));

  assert.deepEqual(routes, [
    { path: "/summary",          methods: ["get"]  },
    { path: "/open",             methods: ["post"] },
    { path: "/movement",         methods: ["post"] },
    { path: "/close",            methods: ["post"] },
    { path: "/mismatch/review",  methods: ["post"] }
  ]);
});
