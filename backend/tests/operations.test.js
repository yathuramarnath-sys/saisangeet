const test = require("node:test");
const assert = require("node:assert/strict");

const {
  getOperationsSummary,
  getOrder,
  requestBillForOrder,
  assignWaiterToOrder,
  addItemToOrder,
  updateOrderItemDetails,
  approveDiscountOverride,
  approveVoidRequest,
  changeOrderStatus
} = require("../src/modules/operations/operations.service");
const { operationsRouter } = require("../src/modules/operations/operations.routes");
const { resetState } = require("../src/modules/operations/operations.memory-store");

test.beforeEach(() => {
  resetState();
});

test("operations summary returns cashier and approval queues", async () => {
  const payload = await getOperationsSummary();

  assert.equal(payload.totals.openOrders, 3);
  assert.equal(payload.totals.billRequested, 1);
  assert.equal(payload.totals.discountApprovalsPending, 1);
  assert.equal(payload.totals.voidApprovalsPending, 1);
});

test("request bill updates the selected order", async () => {
  const payload = await requestBillForOrder("t1", {
    actorName: "Waiter Priya",
    actorRole: "Waiter"
  });

  assert.equal(payload.billRequested, true);
  assert.equal(payload.billRequestedAt, "Now");
  assert.equal(payload.auditTrail[0].label, "Bill requested");
  assert.equal(payload.auditTrail[0].actor, "Waiter Priya");
});

test("assign waiter updates the selected order", async () => {
  const payload = await assignWaiterToOrder("t1", {
    waiterName: "Waiter Devi",
    actorName: "Captain Karthik",
    actorRole: "Captain"
  });

  assert.equal(payload.assignedWaiter, "Waiter Devi");
  assert.equal(payload.auditTrail[0].label, "Waiter assigned");
});

test("add item and kitchen note update the order", async () => {
  const added = await addItemToOrder("t1", {
    id: "line-extra",
    menuItemId: "veg-biryani",
    name: "Veg Biryani",
    quantity: 1,
    price: 240,
    actorName: "Cashier Anita",
    actorRole: "Cashier"
  });

  assert.equal(added.items.at(-1).name, "Veg Biryani");
  assert.equal(added.auditTrail[0].label, "Item added");

  const updated = await updateOrderItemDetails("t1", "line-extra", {
    note: "No garlic",
    actorName: "Captain Karthik",
    actorRole: "Captain"
  });

  assert.equal(updated.items.at(-1).note, "No garlic");
  assert.equal(updated.auditTrail[0].label, "Kitchen note added");
});

test("discount approval records manager otp actor", async () => {
  const payload = await approveDiscountOverride("t2", {
    actorRole: "Manager",
    otpVerified: true
  });

  assert.equal(payload.discountOverrideRequested, false);
  assert.equal(payload.discountApprovalStatus, "Approved");
  assert.equal(payload.discountApprovedBy, "Manager OTP");
});

test("void approval records owner otp actor and deleted bill log", async () => {
  const payload = await approveVoidRequest("t3", {
    actorRole: "Owner",
    otpVerified: true
  });

  assert.equal(payload.voidRequested, false);
  assert.equal(payload.voidApprovedBy, "Owner OTP");
  assert.equal(payload.deletedBillLog[0].orderNumber, 10033);
});

test("status update records waiter delivery and kitchen preparation changes", async () => {
  const preparing = await changeOrderStatus("t1", {
    pickupStatus: "preparing",
    actorName: "Chef Manoj",
    actorRole: "Kitchen"
  });

  assert.equal(preparing.pickupStatus, "preparing");
  assert.equal(preparing.auditTrail[0].label, "Accepted in kitchen");

  const delivered = await changeOrderStatus("t1", {
    pickupStatus: "delivered",
    actorName: "Waiter Priya",
    actorRole: "Waiter"
  });

  assert.equal(delivered.pickupStatus, "delivered");
  assert.equal(delivered.auditTrail[0].label, "Delivered to table");
});

test("getOrder returns a single table order snapshot", async () => {
  const payload = await getOrder("t2");

  assert.equal(payload.tableNumber, "T2");
  assert.equal(payload.orderNumber, 10032);
  assert.equal(payload.discountOverrideRequested, true);
});

test("operations routes register the expected endpoints", () => {
  const routes = operationsRouter.stack
    .filter((layer) => layer.route)
    .map((layer) => ({
      path: layer.route.path,
      methods: Object.keys(layer.route.methods)
    }));

  assert.deepEqual(routes, [
    { path: "/summary", methods: ["get"] },
    { path: "/orders", methods: ["get"] },
    { path: "/orders/:tableId", methods: ["get"] },
    { path: "/orders/:tableId/kot", methods: ["post"] },
    { path: "/orders/:tableId/request-bill", methods: ["post"] },
    { path: "/orders/:tableId/assign-waiter", methods: ["post"] },
    { path: "/orders/:tableId/items", methods: ["post"] },
    { path: "/orders/:tableId/items/:itemId", methods: ["patch"] },
    { path: "/orders/:tableId/discount-approval", methods: ["post"] },
    { path: "/orders/:tableId/void-approval", methods: ["post"] },
    { path: "/orders/:tableId/status", methods: ["post"] }
  ]);
});
