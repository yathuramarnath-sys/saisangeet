const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const express = require("express");
const jwt = require("jsonwebtoken");
const request = require("supertest");

// Stand-in data stores: two restaurants, so we can prove one never sees the other.
const { getCurrentTenantId } = require("../src/data/tenant-context");
const stub = (rel, exportsObj) => {
  const p = path.resolve(__dirname, rel);
  require.cache[p] = { id: p, filename: p, loaded: true, exports: exportsObj };
};
const OUTLETS = { t1: [{ id: "o1", name: "T Nagar", isActive: true }, { id: "o2", name: "Adyar", isActive: true }], t2: [{ id: "x9", name: "Other", isActive: true }] };
stub("../src/data/owner-setup-store.js", {
  getOwnerSetupData: () => {
    const t = getCurrentTenantId();
    return { businessProfile: { tradeName: t === "t1" ? "Sai Sangeet" : "Other Hotel" }, users: [{ id: "u1", email: "owner@example.com", fullName: "Amar" }], outlets: OUTLETS[t] || [] };
  }
});
stub("../src/db/database-mode.js", { isDatabaseEnabled: () => true });
const order = (outletId, price, qty, extra = {}) => ({ id: `${outletId}-${price}-${Math.random()}`, outletId, items: [{ price, quantity: qty, taxRate: 5 }], closedAt: "2026-09-10T10:00:00Z", ...extra });
stub("../src/db/closed-orders.repository.js", {
  queryClosedOrders: async (tenantId) =>
    tenantId === "t1"
      ? [order("o1", 105, 10), order("o2", 210, 5, { discountAmount: 105 }), { id: "v", outletId: "o1", items: [{ price: 1000, quantity: 1, isVoided: true }] }]
      : [order("x9", 999999, 1)]
});
stub("../src/modules/operations/closed-orders-store.js", { getSalesForRange: () => [] });
stub("../src/modules/operations/shifts-store.js", {
  getShifts: (tenantId) => ({
    active: [],
    history: [],
    movements:
      tenantId === "t1"
        ? [
            { id: "mv-1", type: "out", amount: 450, reason: "Petty expense", notes: "diesel", cashier: "Selvi", outlet: "T Nagar", time: "2026-10-12T05:00:00Z" },
            { id: "mv-2", type: "in", amount: 2000, reason: "Change refill", outlet: "T Nagar", time: "2026-10-12T05:10:00Z" },
            { id: "mv-0", type: "out", amount: 90, reason: "Other", outlet: "Adyar", time: "2026-09-01T05:00:00Z" }
          ]
        : [{ id: "t2-mv", type: "out", amount: 5, outlet: "Other", time: "2026-10-12T05:00:00Z" }]
  })
});

const { env } = require("../src/config/env");
const { purchaseRouter, partnerRouter } = require("../src/modules/purchase/purchase-link.routes");
const { errorHandler } = require("../src/middleware/error-handler");
const { runWithTenant } = require("../src/data/tenant-context");

const SECRET = "p".repeat(40);
function app(user) {
  const a = express();
  a.use(express.json());
  a.use("/api/v1/partner/purchase", partnerRouter);
  a.use((req, _res, next) => {
    req.user = user;
    if (user) return runWithTenant(user.tenantId, () => next());
    next();
  });
  a.use("/api/v1/purchase", purchaseRouter);
  a.use(errorHandler);
  return a;
}
const owner = { sub: "u1", tenantId: "t1", roles: ["Owner"], fullName: "Amar" };
const link = (claims, opts = {}) =>
  jwt.sign(claims, opts.secret || SECRET, { algorithm: "HS256", issuer: opts.issuer || "plato-purchase", audience: opts.audience || "dinexpos-partner", expiresIn: 60 });

test("purchase: owner gets a one-time login link with active outlets; others refused", async () => {
  env.platoLinkSecret = SECRET;
  env.purchaseAppUrl = "https://purchase.dinexpos.in/";
  await request(app({ ...owner, roles: ["Cashier"] })).post("/api/v1/purchase/sso-ticket").expect(403);
  const res = await request(app(owner)).post("/api/v1/purchase/sso-ticket").expect(200);
  assert.match(res.body.url, /^https:\/\/purchase\.dinexpos\.in\/sso#ticket=/);
  const p = jwt.verify(decodeURIComponent(res.body.url.split("#ticket=")[1]), SECRET, { issuer: "dinexpos", audience: "plato-purchase" });
  assert.equal(p.tenantId, "t1");
  assert.equal(p.businessName, "Sai Sangeet");
  assert.deepEqual(p.outlets.map((o) => o.id), ["o1", "o2"]);
  assert.ok(p.jti && p.exp - p.iat <= 120);
});

test("purchase: falls back to the Attendance secret when PLATO_LINK_SECRET is not set", async () => {
  env.platoLinkSecret = "";
  env.attendanceSsoSecret = SECRET;
  const res = await request(app()).get("/api/v1/partner/purchase/sales?month=2026-09").set("Authorization", `Bearer ${link({ tenantId: "t1" })}`).expect(200);
  assert.ok(res.body.byOutlet);
  env.attendanceSsoSecret = "";
  await request(app()).get("/api/v1/partner/purchase/sales?month=2026-09").set("Authorization", `Bearer ${link({ tenantId: "t1" })}`).expect(503);
  env.platoLinkSecret = SECRET;
});

test("partner sales: net without GST per outlet, voided items and discount removed", async () => {
  const res = await request(app()).get("/api/v1/partner/purchase/sales?month=2026-09").set("Authorization", `Bearer ${link({ tenantId: "t1" })}`).expect(200);
  // o1: 105 × 10 = 1050 incl. 5% GST → 1000; o2: 210 × 5 = 1050 − 105 discount = 945 → 900
  assert.deepEqual(res.body.byOutlet, { o1: 1000, o2: 900 });
  assert.deepEqual(res.body.withGst, { o1: 1050, o2: 945 });
  assert.equal(res.body.total, 1900);
  await request(app()).get("/api/v1/partner/purchase/sales?month=2026-13").set("Authorization", `Bearer ${link({ tenantId: "t1" })}`).expect(400);
});

test("partner: bad / wrong-purpose tokens refused; each restaurant sees only its own data", async () => {
  const get = (t, q = "month=2026-09") => request(app()).get(`/api/v1/partner/purchase/sales?${q}`).set("Authorization", `Bearer ${t}`);
  await request(app()).get("/api/v1/partner/purchase/sales?month=2026-09").expect(401);
  await get(link({ tenantId: "t1" }, { secret: "x".repeat(40) })).expect(401);
  await get(link({ tenantId: "t1" }, { audience: "plato-purchase" })).expect(401); // a login ticket is not a link token
  await get(link({ tenantId: "t1" }, { issuer: "dinexpos" })).expect(401);
  await get(link({ tenantId: "default" })).expect(401);
  const other = (await get(link({ tenantId: "t2" })).expect(200)).body;
  assert.deepEqual(Object.keys(other.byOutlet), ["x9"]);
  const outs = (await request(app()).get("/api/v1/partner/purchase/cash-outs?since=2026-01-01T00:00:00Z").set("Authorization", `Bearer ${link({ tenantId: "t2" })}`).expect(200)).body;
  assert.deepEqual(outs.cashOuts.map((c) => c.id), ["t2-mv"]);
});

test("partner cash outs: only money out, since the given time, with the outlet id", async () => {
  const res = await request(app()).get("/api/v1/partner/purchase/cash-outs?since=2026-10-01T00:00:00Z").set("Authorization", `Bearer ${link({ tenantId: "t1" })}`).expect(200);
  assert.deepEqual(res.body.cashOuts, [
    { id: "mv-1", outletId: "o1", outletName: "T Nagar", amount: 450, reason: "Petty expense", notes: "diesel", cashier: "Selvi", time: "2026-10-12T05:00:00Z" }
  ]);
  await request(app()).get("/api/v1/partner/purchase/cash-outs?since=yesterday").set("Authorization", `Bearer ${link({ tenantId: "t1" })}`).expect(400);
});
