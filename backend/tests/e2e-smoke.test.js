/**
 * e2e-smoke.test.js
 *
 * Full end-to-end smoke test for the Plato POS system.
 * Simulates a real evening's service cycle with all 4 connected clients:
 *
 *   Owner Console  → login, read outlet config
 *   POS Terminal   → open shift, take payment, close shift
 *   Captain App    → add items to order, send KOT, request bill
 *   KDS Screen     → receive KOT ticket, advance status (new → preparing → ready)
 *
 * The test spins up the real Express + Socket.io server on a random port,
 * creates a fresh test tenant via the signup flow (which auto-seeds demo
 * outlet + menu), and walks through the full order lifecycle.
 *
 * Run:  node --test tests/e2e-smoke.test.js
 */

"use strict";

process.env.NODE_ENV = "test";
process.env.ENABLE_DATABASE = "false";   // JSON file fallback — no Postgres needed
process.env.JWT_SECRET = "e2e-test-secret-do-not-use-in-production";

const test     = require("node:test");
const assert   = require("node:assert/strict");
const http     = require("node:http");
const { io: socketIOClient } = require("socket.io-client");
const supertest = require("supertest");

// ── Server bootstrap ──────────────────────────────────────────────────────────
// We build the real app + attach Socket.io — same wiring as server.js but
// without runMigrations / scheduleBackup so tests start in < 100 ms.
const { createApp }  = require("../src/app");
const { Server: SocketServer } = require("socket.io");
const jwt            = require("jsonwebtoken");
const { env }        = require("../src/config/env");
const {
  getAllCachedTenants,
  resetOwnerSetupForTest,
  getOwnerSetupData,
} = require("../src/data/owner-setup-store");
const { applyDemoSeed } = require("../src/data/demo-seed");
const {
  resetStateForTest
} = require("../src/modules/operations/operations.memory-store");
const {
  markHydratedForTest
} = require("../src/modules/operations/operations.state");

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Wrap supertest to always go to the test server */
let request;

/** Socket clients — created once, reused across tests */
let posSock, captainSock, kdsSock;

/** Shared state built up as tests run */
const ctx = {
  ownerJwt:    null,
  deviceToken: null,
  outletId:    null,
  tableId:     null,
  kotId:       null,
  billTotal:   null,
  server:      null,
  baseUrl:     null,
};

/** Collect socket events into queues so tests can await them */
function makeEventQueue(socket, eventName) {
  const queue   = [];
  const waiters = [];
  socket.on(eventName, (data) => {
    if (waiters.length) {
      waiters.shift()(data);
    } else {
      queue.push(data);
    }
  });
  return {
    next(timeoutMs = 5000) {
      if (queue.length) return Promise.resolve(queue.shift());
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          const idx = waiters.indexOf(resolve);
          if (idx !== -1) waiters.splice(idx, 1);
          reject(new Error(`Timeout waiting for "${eventName}" event after ${timeoutMs}ms`));
        }, timeoutMs);
        waiters.push((data) => { clearTimeout(timer); resolve(data); });
      });
    }
  };
}

/** POST helper — device token auth */
async function devicePost(path, body) {
  const res = await request
    .post(path)
    .set("Authorization", `Bearer ${ctx.deviceToken}`)
    .set("Origin", "capacitor://localhost")
    .send(body);
  return res;
}

/** PATCH helper — device token auth */
async function devicePatch(path, body) {
  const res = await request
    .patch(path)
    .set("Authorization", `Bearer ${ctx.deviceToken}`)
    .set("Origin", "capacitor://localhost")
    .send(body);
  return res;
}

/** GET helper — device token auth */
async function deviceGet(path) {
  const res = await request
    .get(path)
    .set("Authorization", `Bearer ${ctx.deviceToken}`)
    .set("Origin", "capacitor://localhost");
  return res;
}

/** POST helper — owner JWT */
async function ownerPost(path, body) {
  const res = await request
    .post(path)
    .set("Authorization", `Bearer ${ctx.ownerJwt}`)
    .set("Origin", "http://localhost:5173")
    .send(body);
  return res;
}

/** GET helper — owner JWT */
async function ownerGet(path) {
  const res = await request
    .get(path)
    .set("Authorization", `Bearer ${ctx.ownerJwt}`)
    .set("Origin", "http://localhost:5173");
  return res;
}

// ── Unique test credentials (timestamp-based to avoid collisions) ─────────────
const TS     = Date.now();
const EMAIL  = `smoke+${TS}@test.dinexpos.in`;
const PWD    = "SmokeTest@123";
const NAME   = `Smoke Café ${TS}`;

// ─────────────────────────────────────────────────────────────────────────────
// SERVER STARTUP & TEARDOWN
// ─────────────────────────────────────────────────────────────────────────────

test.before(async () => {
  // Reset in-memory operations state and pre-mark as hydrated so
  // syncOperationsState() doesn't load the real on-disk snapshot.
  resetStateForTest();
  markHydratedForTest();

  // Clear any existing owner data from the cache so signup is open.
  // This is test-only — the on-disk file is NOT touched.
  resetOwnerSetupForTest("default");

  // Apply demo seed (outlet + menu + staff) to the blank cache so the test
  // tenant has data to work with immediately after signup.
  // applyDemoSeed mutates the cached object in-place.
  const blankData = getOwnerSetupData();   // returns blank normalized cache entry
  applyDemoSeed(blankData, "default");

  // Build the real Express app
  const app    = createApp();
  const server = http.createServer(app);

  // Attach Socket.io — minimal version of the wiring in server.js
  function resolveTenant(outletId) {
    if (!outletId) return "default";
    try {
      for (const [tid, data] of getAllCachedTenants()) {
        if ((data.outlets || []).some(o => o.id === outletId)) return tid;
      }
    } catch (_) {}
    return "default";
  }

  const outletAvailability  = {};
  const outletOnlineEnabled = {};
  app.locals.outletAvailability  = outletAvailability;
  app.locals.outletOnlineEnabled = outletOnlineEnabled;

  const io = new SocketServer(server, {
    cors: { origin: "*", methods: ["GET", "POST"] },
  });
  app.locals.io = io;

  io.on("connection", (socket) => {
    const { outletId, kdsStation, token: dashToken } = socket.handshake.query;

    if (!outletId && dashToken) {
      try {
        const decoded = jwt.verify(dashToken, env.jwtSecret);
        if (decoded?.tenantId) socket.join(`tenant:${decoded.tenantId}`);
      } catch (_) {}
      return;
    }

    const tenantId = resolveTenant(outletId);
    if (outletId) {
      socket.join(`outlet:${tenantId}:${outletId}`);
      socket.join(`tenant:${tenantId}`);
      socket.to(`outlet:${tenantId}:${outletId}`).emit("request:order-sync");
    }
    if (outletId && kdsStation !== undefined) {
      const room = kdsStation
        ? `kds:${tenantId}:${outletId}:${String(kdsStation).trim().toLowerCase()}`
        : `kds:${tenantId}:${outletId}:__all__`;
      socket.join(room);
    }
    socket.on("order:update", (data) => {
      if (data.outletId && data.order) {
        const tid = resolveTenant(data.outletId);
        socket.to(`outlet:${tid}:${data.outletId}`).emit("order:updated", data.order);
      }
    });
    socket.on("kot:status", (data) => {
      if (data.outletId) {
        const tid = resolveTenant(data.outletId);
        socket.to(`outlet:${tid}:${data.outletId}`).emit("kot:status", data);
      }
    });
    socket.on("item:availability", (data) => {
      if (!data.outletId || !data.itemId) return;
      const tid = resolveTenant(data.outletId);
      if (!outletAvailability[data.outletId]) outletAvailability[data.outletId] = {};
      if (data.available) delete outletAvailability[data.outletId][data.itemId];
      else outletAvailability[data.outletId][data.itemId] = false;
      socket.to(`outlet:${tid}:${data.outletId}`).emit("item:availability", data);
    });
    if (outletId && outletAvailability[outletId]) {
      socket.emit("item:availability:state", outletAvailability[outletId]);
    }
  });

  // Start on a random available port
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;

  ctx.server  = server;
  ctx.baseUrl = `http://127.0.0.1:${port}`;
  request     = supertest(app);

  console.log(`\n[e2e] Server started on port ${port}`);
});

test.after(async () => {
  if (posSock)     posSock.disconnect();
  if (captainSock) captainSock.disconnect();
  if (kdsSock)     kdsSock.disconnect();
  if (ctx.server)  await new Promise((r) => ctx.server.close(r));
  console.log("[e2e] Server stopped.");
});

// ─────────────────────────────────────────────────────────────────────────────
// STEP 1 — OWNER: SIGN UP + LOGIN
// ─────────────────────────────────────────────────────────────────────────────

test("1.1 — owner signs up and gets a JWT", async () => {
  const res = await request
    .post("/api/v1/auth/signup")
    .set("Origin", "http://localhost:5173")
    .send({
      fullName:     "Smoke Test Owner",
      businessName: NAME,
      email:        EMAIL,
      password:     PWD,
      phone:        "9999999999",
    });

  assert.equal(res.status, 201, `Signup failed: ${JSON.stringify(res.body)}`);
  assert.ok(res.body.token, "signup should return a JWT");
  ctx.ownerJwt = res.body.token;
  console.log("  ✓ owner signed up");
});

test("1.2 — owner can GET /auth/me", async () => {
  const res = await ownerGet("/api/v1/auth/me");
  assert.equal(res.status, 200, `GET /me failed: ${JSON.stringify(res.body)}`);
  assert.ok(res.body.fullName || res.body.id, "me should return owner data");
  console.log(`  ✓ owner identity: ${res.body.fullName || res.body.id}`);
});

// ─────────────────────────────────────────────────────────────────────────────
// STEP 2 — OWNER: READ DEMO OUTLET + CREATE DEVICE LINK CODE
// ─────────────────────────────────────────────────────────────────────────────

test("2.1 — demo outlet was seeded on signup", async () => {
  const res = await ownerGet("/api/v1/outlets");
  assert.equal(res.status, 200, `GET /outlets failed: ${JSON.stringify(res.body)}`);
  const outlets = res.body;
  assert.ok(Array.isArray(outlets) && outlets.length > 0, "at least one outlet should exist");
  ctx.outletId   = outlets[0].id;
  ctx.outletCode = outlets[0].code;
  console.log(`  ✓ demo outlet: "${outlets[0].name}" id=${ctx.outletId} code=${ctx.outletCode}`);
});

test("2.2 — owner creates a device link code for the outlet", async () => {
  const res = await ownerPost("/api/v1/devices/link-token", {
    deviceType: "pos",
    outletId:   ctx.outletId,
    outletCode: ctx.outletCode,
  });
  assert.ok([200, 201].includes(res.status), `POST /devices/link-token failed: ${JSON.stringify(res.body)}`);
  assert.ok(res.body.linkCode, "link code should be returned");
  ctx.linkCode = res.body.linkCode;
  console.log(`  ✓ link code created: ${ctx.linkCode}`);
});

// ─────────────────────────────────────────────────────────────────────────────
// STEP 3 — DEVICE: RESOLVE LINK CODE → GET DEVICE TOKEN
// ─────────────────────────────────────────────────────────────────────────────

test("3.1 — POS device resolves link code and gets a device token", async () => {
  const res = await request
    .post("/api/v1/devices/resolve-link-code")
    .set("Origin", "capacitor://localhost")
    .send({
      linkCode:   ctx.linkCode,
      deviceName: "Smoke Test POS",
      deviceType: "pos",
    });

  assert.equal(res.status, 200, `resolve-link-code failed: ${JSON.stringify(res.body)}`);
  assert.ok(res.body.deviceToken, "device token should be returned");
  ctx.deviceToken = res.body.deviceToken;
  console.log(`  ✓ device token issued (outletId=${res.body.outletId})`);
});

test("3.2 — device token reads menu items", async () => {
  const res = await deviceGet("/api/v1/menu/items");
  assert.equal(res.status, 200, `GET /menu/items failed: ${JSON.stringify(res.body)}`);
  const items = res.body;
  assert.ok(Array.isArray(items) && items.length > 0, "menu items should exist (demo seed)");
  ctx.menuItems = items;
  console.log(`  ✓ ${items.length} menu items loaded`);
});

// ─────────────────────────────────────────────────────────────────────────────
// STEP 4 — SOCKETS: POS + CAPTAIN + KDS CONNECT
// ─────────────────────────────────────────────────────────────────────────────

test("4.1 — POS, Captain, KDS connect via Socket.io", async () => {
  const socketOpts = {
    transports: ["websocket"],
    reconnection: false,
    forceNew: true,
  };

  // POS socket
  posSock = socketIOClient(ctx.baseUrl, {
    ...socketOpts,
    query: { outletId: ctx.outletId },
  });

  // Captain socket
  captainSock = socketIOClient(ctx.baseUrl, {
    ...socketOpts,
    query: { outletId: ctx.outletId },
  });

  // KDS socket — subscribes to ALL stations (kdsStation = "")
  kdsSock = socketIOClient(ctx.baseUrl, {
    ...socketOpts,
    query: { outletId: ctx.outletId, kdsStation: "" },
  });

  // Wait for all 3 to connect
  await Promise.all([
    new Promise((resolve, reject) => {
      posSock.once("connect", resolve);
      posSock.once("connect_error", reject);
      setTimeout(() => reject(new Error("POS socket connect timeout")), 5000);
    }),
    new Promise((resolve, reject) => {
      captainSock.once("connect", resolve);
      captainSock.once("connect_error", reject);
      setTimeout(() => reject(new Error("Captain socket connect timeout")), 5000);
    }),
    new Promise((resolve, reject) => {
      kdsSock.once("connect", resolve);
      kdsSock.once("connect_error", reject);
      setTimeout(() => reject(new Error("KDS socket connect timeout")), 5000);
    }),
  ]);

  // Set up event queues for inter-device broadcast assertions
  ctx.posOrderUpdated  = makeEventQueue(posSock, "order:updated");
  ctx.posKotStatus     = makeEventQueue(posSock, "kot:status");
  ctx.kdsKotNew        = makeEventQueue(kdsSock, "kot:new");
  ctx.captainKotStatus = makeEventQueue(captainSock, "kot:status");

  console.log("  ✓ POS, Captain, KDS all connected");
});

// ─────────────────────────────────────────────────────────────────────────────
// STEP 5 — POS: OPEN SHIFT
// ─────────────────────────────────────────────────────────────────────────────

test("5.1 — POS opens a shift with opening cash", async () => {
  const shiftId = `shift-${TS}`;
  const res = await devicePost("/api/v1/shifts/open", {
    shift: {
      id:          shiftId,
      cashierName: "Demo Cashier",
      outletName:  "Main Branch",
      outletId:    ctx.outletId,
      openingCash: 5000,
      startedAt:   new Date().toISOString(),
    }
  });

  assert.ok([200, 201].includes(res.status), `POST /shifts/open failed: ${JSON.stringify(res.body)}`);
  ctx.shiftId = shiftId;
  console.log(`  ✓ shift opened: ${shiftId}`);
});

test("5.2 — shift appears in owner summary", async () => {
  const res = await ownerGet("/api/v1/shifts/summary");
  assert.equal(res.status, 200, `GET /shifts/summary failed: ${JSON.stringify(res.body)}`);
  const { active } = res.body;
  assert.ok(Array.isArray(active), "active should be an array");
  const ourShift = active.find(s => s.id === ctx.shiftId);
  assert.ok(ourShift, `shift ${ctx.shiftId} should appear in active list`);
  console.log(`  ✓ shift visible in summary (${active.length} active)`);
});

// ─────────────────────────────────────────────────────────────────────────────
// STEP 6 — CAPTAIN: GET TABLE, ADD ITEMS TO ORDER
// ─────────────────────────────────────────────────────────────────────────────

test("6.1 — POS gets current table orders", async () => {
  const res = await deviceGet("/api/v1/operations/orders");
  assert.equal(res.status, 200, `GET /operations/orders failed: ${JSON.stringify(res.body)}`);
  const orders = res.body;
  assert.ok(Array.isArray(orders) && orders.length > 0, "at least one table order should exist");
  // Pick the first table that has no items
  const emptyTable = orders.find(o => (o.items || []).length === 0);
  assert.ok(emptyTable, "should have at least one empty table");
  ctx.tableId = emptyTable.tableId;
  console.log(`  ✓ ${orders.length} tables loaded — using ${emptyTable.tableNumber || ctx.tableId}`);
});

test("6.2 — Captain adds items to the order", async () => {
  const items = ctx.menuItems || [];
  const starter = items.find(i => i.categoryId === "cat-demo-starter") || items[0];
  const main    = items.find(i => i.categoryId === "cat-demo-main")    || items[1];

  assert.ok(starter, "should have a starter item");
  assert.ok(main,    "should have a main course item");

  // Add starter
  const r1 = await devicePost("/api/v1/operations/order/item", {
    tableId: ctx.tableId,
    item: {
      menuItemId: starter.id,
      name:       starter.name,
      price:      starter.price || 220,
      quantity:   2,
      note:       "Extra spicy",
    },
  });
  assert.ok([200, 201].includes(r1.status), `Add starter failed: ${JSON.stringify(r1.body)}`);

  // Add main course
  const r2 = await devicePost("/api/v1/operations/order/item", {
    tableId: ctx.tableId,
    item: {
      menuItemId: main.id,
      name:       main.name,
      price:      main.price || 200,
      quantity:   1,
      note:       "",
    },
  });
  assert.ok([200, 201].includes(r2.status), `Add main failed: ${JSON.stringify(r2.body)}`);

  ctx.starter = starter;
  ctx.main    = main;
  console.log(`  ✓ items added: 2× ${starter.name}, 1× ${main.name}`);
});

test("6.3 — order:update broadcast → POS receives order:updated via socket", async () => {
  // Captain broadcasts the order state to POS after adding items
  captainSock.emit("order:update", {
    outletId: ctx.outletId,
    order:    {
      tableId:    ctx.tableId,
      source:     "captain",
      itemCount:  2,
      updatedAt:  Date.now(),
    },
  });

  const updated = await ctx.posOrderUpdated.next(4000);
  assert.ok(updated, "POS should receive order:updated");
  assert.equal(updated.tableId, ctx.tableId, "order update should be for the correct table");
  console.log("  ✓ order:updated received by POS");
});

// ─────────────────────────────────────────────────────────────────────────────
// STEP 7 — CAPTAIN: SEND KOT → KDS RECEIVES TICKET
// ─────────────────────────────────────────────────────────────────────────────

test("7.1 — Captain sends KOT", async () => {
  const res = await devicePost("/api/v1/operations/kot", {
    tableId:     ctx.tableId,
    outletId:    ctx.outletId,
    source:      "captain",
    areaName:    "AC Hall",
    stationName: "",   // backend resolves to Main Kitchen
    items: [
      { id: `line-s-${TS}`, menuItemId: ctx.starter.id, name: ctx.starter.name,
        price: ctx.starter.price || 220, quantity: 2, note: "Extra spicy", sentToKot: false },
      { id: `line-m-${TS}`, menuItemId: ctx.main.id,    name: ctx.main.name,
        price: ctx.main.price    || 200, quantity: 1, note: "",            sentToKot: false },
    ],
    actorName: "Demo Captain",
  });

  assert.ok([200, 201].includes(res.status), `POST /operations/kot failed: ${JSON.stringify(res.body)}`);
  console.log("  ✓ KOT sent to kitchen");
});

test("7.2 — KDS receives kot:new socket event", async () => {
  // KDS should receive the KOT via socket broadcast
  const kotEvent = await ctx.kdsKotNew.next(5000);
  assert.ok(kotEvent, "KDS should receive kot:new event");
  assert.ok(kotEvent.id || kotEvent.kotNumber, "KOT should have an id or kotNumber");
  ctx.kotId = kotEvent.id;
  console.log(`  ✓ KDS received KOT: ${kotEvent.kotNumber || kotEvent.id} (${kotEvent.items?.length || 0} items)`);
});

test("7.3 — KDS can list pending KOTs via API", async () => {
  const res = await deviceGet(`/api/v1/operations/kots?outletId=${ctx.outletId}`);
  assert.equal(res.status, 200, `GET /operations/kots failed: ${JSON.stringify(res.body)}`);
  const kots = res.body;
  assert.ok(Array.isArray(kots) && kots.length > 0, "at least one KOT should be in the queue");
  // Grab the KOT id if we didn't get it from socket
  if (!ctx.kotId) ctx.kotId = kots[0].id;
  console.log(`  ✓ ${kots.length} KOT(s) in queue`);
});

// ─────────────────────────────────────────────────────────────────────────────
// STEP 8 — KDS: ADVANCE KOT STATUS (new → preparing → ready)
// ─────────────────────────────────────────────────────────────────────────────

test("8.1 — KDS updates KOT to 'preparing'", async () => {
  assert.ok(ctx.kotId, "kotId must be set from step 7");

  const res = await devicePatch(
    `/api/v1/operations/kots/${ctx.kotId}/status?outletId=${ctx.outletId}`,
    { status: "preparing" }
  );

  assert.ok([200, 201].includes(res.status), `PATCH kots/:id/status failed: ${JSON.stringify(res.body)}`);
  console.log("  ✓ KOT advanced to 'preparing'");
});

test("8.2 — kot:status socket event reaches POS and Captain", async () => {
  // KDS emits kot:status to broadcast "preparing" to POS + Captain
  kdsSock.emit("kot:status", {
    id:       ctx.kotId,
    status:   "preparing",
    outletId: ctx.outletId,
  });

  const [posEvent, captainEvent] = await Promise.all([
    ctx.posKotStatus.next(4000),
    ctx.captainKotStatus.next(4000),
  ]);

  assert.ok(posEvent,     "POS should receive kot:status");
  assert.ok(captainEvent, "Captain should receive kot:status");
  assert.equal(posEvent.status,     "preparing", "POS should see preparing status");
  assert.equal(captainEvent.status, "preparing", "Captain should see preparing status");
  console.log("  ✓ kot:status 'preparing' received by POS and Captain");
});

test("8.3 — KDS bumps KOT to 'ready'", async () => {
  const res = await devicePatch(
    `/api/v1/operations/kots/${ctx.kotId}/status?outletId=${ctx.outletId}`,
    { status: "ready" }
  );

  assert.ok([200, 201].includes(res.status), `KOT ready failed: ${JSON.stringify(res.body)}`);
  console.log("  ✓ KOT marked ready");
});

// ─────────────────────────────────────────────────────────────────────────────
// STEP 9 — CAPTAIN: REQUEST BILL
// ─────────────────────────────────────────────────────────────────────────────

test("9.1 — Captain requests the bill", async () => {
  const res = await devicePost("/api/v1/operations/bill-request", {
    tableId:   ctx.tableId,
    outletId:  ctx.outletId,
    actorName: "Demo Captain",
  });

  assert.ok([200, 201].includes(res.status), `POST /bill-request failed: ${JSON.stringify(res.body)}`);
  console.log("  ✓ bill requested");
});

test("9.2 — POS sees bill-requested flag on the order", async () => {
  const res = await deviceGet("/api/v1/operations/orders");
  const orders = res.body || [];
  const table  = orders.find(o => o.tableId === ctx.tableId);
  assert.ok(table, "table order should exist");
  assert.equal(table.billRequested, true, "billRequested should be true");
  console.log(`  ✓ POS sees billRequested=true for ${table.tableNumber || ctx.tableId}`);
});

// ─────────────────────────────────────────────────────────────────────────────
// STEP 10 — POS: TAKE PAYMENT + SETTLE
// ─────────────────────────────────────────────────────────────────────────────

test("10.1 — POS records a cash payment", async () => {
  const starterTotal = (ctx.starter?.price || 220) * 2;
  const mainTotal    = (ctx.main?.price    || 200) * 1;
  ctx.billTotal      = starterTotal + mainTotal;

  const res = await devicePost("/api/v1/operations/payment", {
    tableId:   ctx.tableId,
    outletId:  ctx.outletId,
    method:    "cash",
    label:     "Cash",
    amount:    ctx.billTotal,
    actorName: "Demo Cashier",
  });

  assert.ok([200, 201].includes(res.status), `POST /payment failed: ${JSON.stringify(res.body)}`);
  console.log(`  ✓ Rs ${ctx.billTotal} cash payment recorded`);
});

test("10.2 — POS settles and closes the order", async () => {
  const res = await devicePost("/api/v1/operations/closed-order", {
    outletId: ctx.outletId,
    order: {
      tableId:      ctx.tableId,
      cashierName:  "Demo Cashier",
      outletName:   "Main Branch",
      items: [
        { menuItemId: ctx.starter.id, name: ctx.starter.name, price: ctx.starter.price || 220, quantity: 2 },
        { menuItemId: ctx.main.id,    name: ctx.main.name,    price: ctx.main.price    || 200, quantity: 1 },
      ],
      payments:       [{ method: "cash", label: "Cash", amount: ctx.billTotal }],
      discountAmount: 0,
      gstRate:        0.05,
      closedAt:       new Date().toISOString(),
    },
  });

  assert.ok([200, 201].includes(res.status), `POST /closed-order failed: ${JSON.stringify(res.body)}`);
  ctx.billNumber = res.body.billNo || res.body.billNumber || res.body.orderNumber;
  console.log(`  ✓ order settled — bill #${ctx.billNumber}`);
});

test("10.3 — table resets to empty after settlement", async () => {
  const res = await deviceGet("/api/v1/operations/orders");
  const orders = res.body || [];
  const table  = orders.find(o => o.tableId === ctx.tableId);
  if (table) {
    // If table still appears, it should have no items (reset to empty)
    assert.equal((table.items || []).length, 0, "table should be empty after settlement");
  }
  // Table may not appear at all if backend removes closed orders — both acceptable
  console.log("  ✓ table is empty / cleared after settlement");
});

// ─────────────────────────────────────────────────────────────────────────────
// STEP 11 — OWNER: VERIFY REPORTS + SHIFTS DATA
// ─────────────────────────────────────────────────────────────────────────────

test("11.1 — owner summary shows the settled order in sales data", async () => {
  const res = await ownerGet("/api/v1/reports/owner-summary");
  assert.equal(res.status, 200, `GET /reports/owner-summary failed: ${JSON.stringify(res.body)}`);

  const { salesData } = res.body;
  assert.ok(salesData, "salesData should be present");

  const dayEnd   = salesData.dayEnd?.summary || salesData.dayEnd || {};
  const netSales = dayEnd.totalSales || dayEnd.netAfterDiscount || dayEnd.netSales || 0;
  assert.ok(netSales > 0, `Day-end net sales should be > 0 after settlement (got ${netSales})`);

  const paymentSummary = salesData.payment?.summary || salesData.payments || {};
  const cashAmt  = paymentSummary.cashAmount || paymentSummary.cash || paymentSummary.Cash || 0;
  assert.ok(cashAmt > 0, `Cash collected should be > 0 (got ${cashAmt})`);

  console.log(`  ✓ owner summary: net sales = Rs ${netSales}, cash = Rs ${cashAmt}`);
});

test("11.2 — item sales tab shows the items we sold", async () => {
  const res = await ownerGet("/api/v1/reports/owner-summary");
  const { salesData } = res.body;

  // itemSales is a flat array directly on salesData (not nested under .items)
  const itemSales = salesData?.itemSales || salesData?.dayEnd?.items || [];
  assert.ok(itemSales.length > 0, "item sales should show at least one item");

  const soldStarter = itemSales.find(i => i.name === ctx.starter?.name);
  assert.ok(soldStarter, `${ctx.starter?.name} should appear in item sales`);
  assert.equal(soldStarter.qty, 2, "starter qty should be 2");

  console.log(`  ✓ item sales: ${itemSales.length} items, top=${itemSales[0]?.name}`);
});

test("11.3 — shifts summary still shows open shift", async () => {
  const res = await ownerGet("/api/v1/shifts/summary");
  assert.equal(res.status, 200, `GET /shifts/summary failed: ${JSON.stringify(res.body)}`);
  const { active, history } = res.body;
  const ourShift = [...(active || []), ...(history || [])].find(s => s.id === ctx.shiftId);
  assert.ok(ourShift, `shift ${ctx.shiftId} should still be visible`);
  console.log(`  ✓ shift visible: status=${ourShift.status || "Open"}`);
});

// ─────────────────────────────────────────────────────────────────────────────
// STEP 12 — POS: CASH MOVEMENT + CLOSE SHIFT
// ─────────────────────────────────────────────────────────────────────────────

test("12.1 — POS records a cash-out movement (change given)", async () => {
  const res = await devicePost("/api/v1/shifts/movement", {
    movement: {
      id:        `mov-${TS}`,
      shiftId:   ctx.shiftId,
      type:      "out",
      amount:    200,
      note:      "Change given to Table 3",
      outletId:  ctx.outletId,
      recordedAt: new Date().toISOString(),
    }
  });

  assert.ok([200, 201].includes(res.status), `POST /shifts/movement failed: ${JSON.stringify(res.body)}`);
  console.log("  ✓ cash-out movement recorded (Rs 200 change)");
});

test("12.2 — movement appears in shifts summary", async () => {
  const res = await ownerGet("/api/v1/shifts/summary");
  const { movements, active } = res.body;

  assert.ok(Array.isArray(movements) && movements.length > 0, "movements list should not be empty");

  const ourShift = (active || []).find(s => s.id === ctx.shiftId);
  if (ourShift) {
    assert.ok((ourShift.cashOut || 0) >= 200, `cashOut should reflect the movement (got ${ourShift.cashOut})`);
  }
  console.log(`  ✓ movement recorded (${movements.length} total movements)`);
});

test("12.3 — POS closes the shift", async () => {
  const expectedClose = 5000 + ctx.billTotal - 200; // opening + sales - change

  const res = await devicePost("/api/v1/shifts/close", {
    shift: {
      id:          ctx.shiftId,
      cashierName: "Demo Cashier",
      outletName:  "Main Branch",
      outletId:    ctx.outletId,
      openingCash: 5000,
      closingCash: expectedClose,
      closedAt:    new Date().toISOString(),
      status:      "Closed",
    }
  });

  assert.ok([200, 201].includes(res.status), `POST /shifts/close failed: ${JSON.stringify(res.body)}`);
  console.log(`  ✓ shift closed (expected close: Rs ${expectedClose})`);
});

test("12.4 — closed shift moves to history", async () => {
  const res = await ownerGet("/api/v1/shifts/summary");
  const { active, history } = res.body;

  const stillActive  = (active  || []).some(s => s.id === ctx.shiftId);
  const inHistory    = (history || []).some(s => s.id === ctx.shiftId);

  assert.equal(stillActive, false, "shift should no longer be active");
  assert.equal(inHistory,   true,  "shift should be in history after close");
  console.log("  ✓ shift moved to history");
});

// ─────────────────────────────────────────────────────────────────────────────
// STEP 13 — ITEM AVAILABILITY SYNC (Owner → POS → Captain → KDS)
// ─────────────────────────────────────────────────────────────────────────────

test("13.1 — owner marks an item as sold-out via backend", async () => {
  const itemId = ctx.starter?.id || "item-d-01";

  const res = await ownerPost("/api/v1/inventory/item-visibility", {
    itemId,
    posVisible: false,
  });

  assert.equal(res.status, 200, `POST /inventory/item-visibility failed: ${JSON.stringify(res.body)}`);
  assert.equal(res.body.ok, true);
  ctx.soldOutItemId = itemId;
  console.log(`  ✓ item ${itemId} marked sold-out`);
});

test("13.2 — POS + Captain + KDS receive item:availability socket broadcast", async () => {
  const posAvail     = makeEventQueue(posSock,     "item:availability");
  const captainAvail = makeEventQueue(captainSock, "item:availability");
  const kdsAvail     = makeEventQueue(kdsSock,     "item:availability");

  // Trigger a new backend call to broadcast (simulates owner console toggle)
  await ownerPost("/api/v1/inventory/item-visibility", {
    itemId:    ctx.soldOutItemId,
    posVisible: false,
  });

  const [posEvt, captainEvt, kdsEvt] = await Promise.all([
    posAvail.next(4000),
    captainAvail.next(4000),
    kdsAvail.next(4000),
  ]);

  assert.ok(posEvt,     "POS should receive item:availability");
  assert.ok(captainEvt, "Captain should receive item:availability");
  assert.ok(kdsEvt,     "KDS should receive item:availability");

  [posEvt, captainEvt, kdsEvt].forEach(evt => {
    assert.equal(evt.itemId,    ctx.soldOutItemId, "itemId should match");
    assert.equal(evt.available, false,             "item should be marked unavailable");
  });

  console.log("  ✓ item:availability broadcast received by all 3 devices");
});

test("13.3 — item can be restored to available", async () => {
  const res = await ownerPost("/api/v1/inventory/item-visibility", {
    itemId:    ctx.soldOutItemId,
    posVisible: true,
  });

  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);
  console.log(`  ✓ item ${ctx.soldOutItemId} restored to available`);
});

// ─────────────────────────────────────────────────────────────────────────────
// STEP 14 — DEVICE FETCH — ensure devices page reflects connected devices
// ─────────────────────────────────────────────────────────────────────────────

test("14.1 — owner can list linked devices", async () => {
  const res = await ownerGet("/api/v1/devices");
  assert.equal(res.status, 200, `GET /devices failed: ${JSON.stringify(res.body)}`);
  const devices = res.body;
  assert.ok(Array.isArray(devices), "devices should be an array");
  console.log(`  ✓ ${devices.length} device(s) registered`);
});

// ─────────────────────────────────────────────────────────────────────────────
// FINAL SUMMARY
// ─────────────────────────────────────────────────────────────────────────────

test("99 — smoke test summary", () => {
  console.log("\n" + "─".repeat(60));
  console.log("  SMOKE TEST COMPLETE");
  console.log("─".repeat(60));
  console.log(`  Owner:        ${EMAIL}`);
  console.log(`  Outlet:       ${ctx.outletId}`);
  console.log(`  Table:        ${ctx.tableId}`);
  console.log(`  KOT:          ${ctx.kotId}`);
  console.log(`  Bill total:   Rs ${ctx.billTotal}`);
  console.log(`  Bill number:  #${ctx.billNumber}`);
  console.log(`  Shift:        ${ctx.shiftId}`);
  console.log("─".repeat(60));
  assert.ok(ctx.billNumber, "bill number must have been assigned");
});
