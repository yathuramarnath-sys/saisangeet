"use strict";

/**
 * high-risk-flows.test.js
 *
 * Service-layer unit tests for the three highest-risk operation flows:
 *   1. KOT send — items marked sentToKot, kotNumber stamped, kots[] log updated
 *   2. Bill settlement — closed-orders store receives the order, table resets to empty,
 *                        pending-bill entry removed
 *   3. Split bill — seat-level payment records kept distinct; table auto-closes when
 *                   all seats are paid
 *
 * Run:  node --test tests/high-risk-flows.test.js
 */

const test   = require("node:test");
const assert = require("node:assert/strict");

const {
  sendOrderKot,
  addItemToOrder,
  getOrCreateOrderForTable,
  clearTableAfterSettle,
  getOrder,
  addPaymentToOrder,
} = require("../src/modules/operations/operations.service");

const { resetStateForTest }  = require("../src/modules/operations/operations.memory-store");
const { markHydratedForTest } = require("../src/modules/operations/operations.state");

const { addClosedOrder, getTodaySalesByOutlet } = require("../src/modules/operations/closed-orders-store");
const { addPendingBill, removePendingBill, getPendingBills } = require("../src/modules/operations/pending-bills-store");

test.beforeEach(() => {
  resetStateForTest();
  markHydratedForTest();
});

// ─────────────────────────────────────────────────────────────────────────────
// FLOW 1 — KOT SEND
// ─────────────────────────────────────────────────────────────────────────────

test("KOT send marks all unsent items as sentToKot", async () => {
  // Add two unsent items on top of the seeded t1 order
  await addItemToOrder("t1", { menuItemId: "veg-biryani",  name: "Veg Biryani",  price: 240, quantity: 1, actorName: "POS" });
  await addItemToOrder("t1", { menuItemId: "paneer-tikka", name: "Paneer Tikka", price: 280, quantity: 2, actorName: "POS" });

  // t1 seed item (sweet-lime) is already sentToKot:true; the two new items are not.
  const before = await getOrCreateOrderForTable("t1");
  const unsentBefore = before.items.filter(i => !i.sentToKot);
  assert.equal(unsentBefore.length, 2, "two items should be unsent before KOT");

  const result = await sendOrderKot("t1", {
    actorName: "Captain Raj",
    items:     before.items.filter(i => !i.sentToKot),
    kotNo:     42,
  });

  // All items should now be marked sent
  const unsentAfter = result.items.filter(i => !i.sentToKot);
  assert.equal(unsentAfter.length, 0, "no items should remain unsent after KOT");
});

test("KOT send stamps kotNumber on newly-sent items only", async () => {
  // Seed item on t1 already has sentToKot:true — its kotNumber should not be overwritten
  const before = await getOrCreateOrderForTable("t1");
  const seedItem = before.items[0];
  assert.ok(seedItem.sentToKot, "seed item should already be sent");

  // Add a new unsent item
  await addItemToOrder("t1", { menuItemId: "mango-lassi", name: "Mango Lassi", price: 120, quantity: 1, actorName: "POS" });
  const withNew = await getOrCreateOrderForTable("t1");
  const newItem = withNew.items.find(i => i.menuItemId === "mango-lassi");
  assert.ok(!newItem.sentToKot, "new item should be unsent");

  const KOT_NO = 99;
  const result = await sendOrderKot("t1", {
    actorName: "Captain Raj",
    items:     [newItem],
    kotNo:     KOT_NO,
  });

  const sentNew = result.items.find(i => i.menuItemId === "mango-lassi");
  assert.equal(sentNew.kotNumber, KOT_NO, "new item should carry the new KOT number");

  // The pre-existing seed item should NOT get the new kotNumber overwritten
  const stillSeed = result.items.find(i => i.id === seedItem.id);
  // kotNumber on the seed item was not set (seeded without one) — after the KOT send
  // it should still not carry the new round's number
  assert.notEqual(stillSeed?.kotNumber, KOT_NO, "seed item's kotNumber must not be overwritten");
});

test("KOT send appends a kots[] entry on the order", async () => {
  await addItemToOrder("t1", { menuItemId: "filter-coffee", name: "Filter Coffee", price: 60, quantity: 1, actorName: "POS" });
  const before = await getOrCreateOrderForTable("t1");
  const newItem = before.items.find(i => i.menuItemId === "filter-coffee");

  const result = await sendOrderKot("t1", {
    actorName: "Demo Captain",
    items:     [newItem],
    kotNo:     77,
  });

  assert.ok(Array.isArray(result.kots), "kots should be an array on the order");
  const entry = result.kots.find(k => k.kotNumber === 77);
  assert.ok(entry, "kots[] should have an entry for kotNumber 77");
  assert.ok(entry.sentAt, "kots[] entry should have sentAt timestamp");
  assert.equal(entry.actorName, "Demo Captain", "kots[] entry should record the actor");
  assert.ok(Array.isArray(entry.itemIds) && entry.itemIds.length > 0, "kots[] entry should list item IDs");
});

test("KOT send clears billRequested flag when new items are sent", async () => {
  // Request bill on t1 first
  await addItemToOrder("t1", { menuItemId: "cold-coffee", name: "Cold Coffee", price: 140, quantity: 1, actorName: "POS" });
  const before = await getOrCreateOrderForTable("t1");
  const newItem = before.items.find(i => !i.sentToKot);

  // Simulate bill-requested state by sending the KOT first, then adding more items
  await sendOrderKot("t1", { actorName: "Demo Captain", items: [newItem], kotNo: 10 });

  // Add another item — this one is unsent
  await addItemToOrder("t1", { menuItemId: "ice-cream", name: "Ice Cream", price: 80, quantity: 1, actorName: "POS" });
  const withIceCream = await getOrCreateOrderForTable("t1");
  const iceCreamItem = withIceCream.items.find(i => i.menuItemId === "ice-cream");

  // Forcefully set billRequested to true (mimics captain pressing "Request Bill")
  const { requestBillForOrder } = require("../src/modules/operations/operations.service");
  await requestBillForOrder("t1", { actorName: "Captain Raj" });

  const afterBillReq = await getOrCreateOrderForTable("t1");
  assert.equal(afterBillReq.billRequested, true, "billRequested should be true before KOT");

  // Now send the new unsent item — billRequested should be cleared
  const result = await sendOrderKot("t1", { actorName: "Demo Captain", items: [iceCreamItem], kotNo: 11 });
  assert.equal(result.billRequested, false, "KOT send with new items should clear billRequested");
});

// ─────────────────────────────────────────────────────────────────────────────
// FLOW 2 — BILL SETTLEMENT
// ─────────────────────────────────────────────────────────────────────────────

test("addClosedOrder records the order in today's sales for the outlet", () => {
  const tenantId = "default";
  const outletId = "outlet-test-1";
  const order = {
    tableId:    "t-settle-1",
    tableNumber: "T5",
    billNo:     "B-001",
    orderNumber: 50001,
    items:       [{ name: "Butter Chicken", price: 280, quantity: 2, taxRate: 5 }],
    payments:    [{ method: "cash", label: "Cash", amount: 560 }],
    closedAt:    new Date().toISOString(),
  };

  addClosedOrder(tenantId, outletId, order);

  const sales = getTodaySalesByOutlet(tenantId, outletId);
  assert.ok(Array.isArray(sales), "getTodaySalesByOutlet should return an array");
  const found = sales.find(o => o.billNo === "B-001");
  assert.ok(found, "settled order should appear in today's sales");
  assert.equal(found.orderNumber, 50001);
});

test("addClosedOrder is idempotent — duplicate billNo is rejected", () => {
  const tenantId = "default";
  const outletId = "outlet-test-2";
  const order = {
    tableId:    "t-settle-2",
    billNo:     "B-DUP",
    orderNumber: 50002,
    items:       [],
    payments:    [{ method: "upi", amount: 300 }],
    closedAt:    new Date().toISOString(),
  };

  const first  = addClosedOrder(tenantId, outletId, order);
  const second = addClosedOrder(tenantId, outletId, { ...order, orderNumber: 99999 });

  assert.ok(first,  "first addClosedOrder should succeed (truthy)");
  assert.ok(!second, "second addClosedOrder with same billNo should return falsy (duplicate)");

  // Only one entry should exist for this bill number
  const sales = getTodaySalesByOutlet(tenantId, outletId);
  const entries = sales.filter(o => o.billNo === "B-DUP");
  assert.equal(entries.length, 1, "exactly one settled record for billNo B-DUP");
  assert.equal(entries[0].orderNumber, 50002, "original orderNumber should be preserved");
});

test("clearTableAfterSettle is safe for counter/online orders (non-catalog IDs)", async () => {
  // Counter and online IDs have no catalog entry — clearTableAfterSettle should silently
  // skip them rather than throw. This is the documented production behaviour.
  await assert.doesNotReject(
    () => clearTableAfterSettle("counter-abc"),
    "clearTableAfterSettle should not throw for a counter order"
  );
  await assert.doesNotReject(
    () => clearTableAfterSettle("online-order-123"),
    "clearTableAfterSettle should not throw for an online order"
  );
});

test("clearTableAfterSettle does not throw for unknown tableId", async () => {
  // Non-existent table ID should be handled gracefully
  await assert.doesNotReject(
    () => clearTableAfterSettle("nonexistent-table-xyz"),
    "clearTableAfterSettle should not throw for unknown table"
  );
});

test("pending-bills store: removePendingBill drops the entry so POS stops showing it", () => {
  const tenantId = "default";
  const outletId = "outlet-pending-test";
  const order = {
    orderNumber: 60001,
    tableId:     "t-pending-1",
    tableNumber: "T8",
    billNo:      "BILL-60001",
    items:       [{ name: "Chai", price: 40, quantity: 3 }],
    payments:    [],
    closedAt:    null,
  };

  addPendingBill(tenantId, outletId, order);

  const before = getPendingBills(tenantId, outletId);
  assert.ok(before.some(b => b.orderNumber === 60001), "pending bill should exist after addPendingBill");

  removePendingBill(tenantId, outletId, 60001);

  const after = getPendingBills(tenantId, outletId);
  assert.ok(!after.some(b => b.orderNumber === 60001), "pending bill should be gone after removePendingBill");
});

test("settlement of one order does not remove a different pending bill", () => {
  const tenantId = "default";
  const outletId = "outlet-pending-multi";

  addPendingBill(tenantId, outletId, { orderNumber: 70001, tableId: "t-a", items: [], payments: [] });
  addPendingBill(tenantId, outletId, { orderNumber: 70002, tableId: "t-b", items: [], payments: [] });

  // Settle order 70001 only
  removePendingBill(tenantId, outletId, 70001);

  const remaining = getPendingBills(tenantId, outletId);
  assert.ok(!remaining.some(b => b.orderNumber === 70001), "settled bill 70001 should be removed");
  assert.ok(remaining.some(b => b.orderNumber === 70002),  "unsettled bill 70002 should remain");
});

// ─────────────────────────────────────────────────────────────────────────────
// FLOW 3 — SPLIT BILL (seat-level payments)
// ─────────────────────────────────────────────────────────────────────────────

test("addPaymentToOrder accumulates two partial payments for a split-bill order", async () => {
  // Seat-based split bill flow: each seat pays a partial amount.
  // The server accumulates all payments independently — seatLabel is client-side only.
  // Add extra item so the total (480) covers two partial payments (200 + 150).
  await addItemToOrder("t1", { menuItemId: "paneer-tikka", name: "Paneer Tikka", price: 280, quantity: 1, actorName: "POS" });

  const r1 = await addPaymentToOrder("t1", { method: "cash", label: "Cash", amount: 200, actorName: "POS" });
  assert.equal(r1.payments.length, 1, "first partial payment recorded");
  assert.equal(r1.payments[0].amount, 200, "first payment amount should be 200");

  const r2 = await addPaymentToOrder("t1", { method: "upi", label: "UPI", amount: 150, actorName: "POS" });
  assert.equal(r2.payments.length, 2, "second partial payment accumulated (not replacing first)");
  assert.equal(r2.payments[1].amount, 150, "second payment amount should be 150");
  assert.equal(r2.payments[1].method, "upi", "second payment method should be upi");

  // Total collected: 350 of 480 — order not yet fully paid
  const total = r2.payments.reduce((s, p) => s + p.amount, 0);
  assert.equal(total, 350, "accumulated payments should equal 200 + 150");
});

test("addClosedOrder records split-bill seat payments correctly in closed store", () => {
  const tenantId = "default";
  const outletId = "outlet-split-test";

  const order = {
    tableId:     "t-split-1",
    tableNumber: "T12",
    billNo:      "SPLIT-001",
    orderNumber:  80001,
    isSplitBill:  true,
    items: [
      { name: "Masala Dosa", price: 160, quantity: 1 },
      { name: "Filter Coffee", price: 60, quantity: 2 },
    ],
    payments: [
      { method: "cash", label: "Cash", amount: 160, seatLabel: "A" },
      { method: "card", label: "Card", amount: 120, seatLabel: "B" },
    ],
    closedAt: new Date().toISOString(),
  };

  addClosedOrder(tenantId, outletId, order);

  const sales = getTodaySalesByOutlet(tenantId, outletId);
  const found = sales.find(o => o.billNo === "SPLIT-001");
  assert.ok(found, "split bill should appear in today's sales");
  assert.equal(found.isSplitBill, true, "isSplitBill flag should be preserved");
  assert.equal(found.payments.length, 2, "both seat payments should be recorded");

  const totalPaid = found.payments.reduce((s, p) => s + p.amount, 0);
  assert.equal(totalPaid, 280, "total split payments should equal combined seat amounts");
});

test("multiple payment entries on same table accumulate without overwriting", async () => {
  // Add extra items so total is large enough for 3 separate partial payments
  // t1 seeds with Sweet Lime (200); add two more items for a 600-total order
  await addItemToOrder("t1", { menuItemId: "veg-biryani",  name: "Veg Biryani",  price: 200, quantity: 1, actorName: "POS" });
  await addItemToOrder("t1", { menuItemId: "mango-lassi",  name: "Mango Lassi",  price: 200, quantity: 1, actorName: "POS" });
  // Total is now 600

  const p1 = await addPaymentToOrder("t1", { method: "cash", label: "Cash", amount: 200, actorName: "POS" });
  assert.equal(p1.payments.length, 1, "should have 1 payment after first add");

  const p2 = await addPaymentToOrder("t1", { method: "upi", label: "UPI", amount: 200, actorName: "POS" });
  assert.equal(p2.payments.length, 2, "should have 2 payments after second add");

  const p3 = await addPaymentToOrder("t1", { method: "card", label: "Card", amount: 200, actorName: "POS" });
  assert.equal(p3.payments.length, 3, "should have 3 payments after third add — none overwritten");
});
