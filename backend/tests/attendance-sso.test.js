const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const express = require("express");
const jwt = require("jsonwebtoken");
const request = require("supertest");

// Stub the tenant data store so the test needs no database or tenant files.
const storePath = path.resolve(__dirname, "../src/data/owner-setup-store.js");
require.cache[storePath] = {
  id: storePath,
  filename: storePath,
  loaded: true,
  exports: {
    getOwnerSetupData: () => ({
      businessProfile: { tradeName: "Sai Sangeet" },
      users: [{ id: "u1", email: "owner@example.com", fullName: "Amar" }],
      outlets: [
        { id: "o1", name: "T Nagar", isActive: true },
        { id: "o2", name: "Closed outlet", isActive: false }
      ]
    })
  }
};

const { env } = require("../src/config/env");
const { attendanceRouter } = require("../src/modules/attendance/attendance-sso.routes");
const { errorHandler } = require("../src/middleware/error-handler");

function appAs(user) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = user;
    next();
  });
  app.use("/api/v1/attendance", attendanceRouter);
  app.use(errorHandler);
  return app;
}

const owner = { sub: "u1", tenantId: "t-123", roles: ["Owner"], fullName: "Amar" };

test("attendance sso: disabled until configured", async () => {
  env.attendanceSsoSecret = "";
  env.attendanceAppUrl = "";
  const res = await request(appAs(owner)).post("/api/v1/attendance/sso-ticket");
  assert.equal(res.status, 503);
});

test("attendance sso: only owners", async () => {
  env.attendanceSsoSecret = "x".repeat(40);
  env.attendanceAppUrl = "https://attendance.dinexpos.in";
  const res = await request(appAs({ ...owner, roles: ["Cashier"] })).post("/api/v1/attendance/sso-ticket");
  assert.equal(res.status, 403);
  const anon = await request(appAs(null)).post("/api/v1/attendance/sso-ticket");
  assert.equal(anon.status, 401);
});

test("attendance sso: owner gets a short signed ticket with active outlets", async () => {
  env.attendanceSsoSecret = "x".repeat(40);
  env.attendanceAppUrl = "https://attendance.dinexpos.in/";
  const res = await request(appAs(owner)).post("/api/v1/attendance/sso-ticket");
  assert.equal(res.status, 200);
  assert.match(res.body.url, /^https:\/\/attendance\.dinexpos\.in\/sso#ticket=/);
  const ticket = decodeURIComponent(res.body.url.split("#ticket=")[1]);
  const payload = jwt.verify(ticket, env.attendanceSsoSecret, { issuer: "dinexpos", audience: "plato-attendance" });
  assert.equal(payload.tenantId, "t-123");
  assert.equal(payload.email, "owner@example.com");
  assert.equal(payload.businessName, "Sai Sangeet");
  assert.deepEqual(payload.outlets, [{ id: "o1", name: "T Nagar" }]);
  assert.ok(payload.exp - payload.iat <= 120);
  assert.ok(payload.jti);
});

// ── Owner app Attendance tab: read-only summary fetched by this server ─────────

const viewer = { ...owner, roles: ["Manager"], permissions: ["reports.view"] };

function withFetch(fake, fn) {
  const real = global.fetch;
  global.fetch = fake;
  return fn().finally(() => {
    global.fetch = real;
  });
}

test("attendance summary: needs reports.view and setup", async () => {
  env.attendanceSsoSecret = "x".repeat(40);
  env.attendanceAppUrl = "https://attendance.dinexpos.in";
  env.attendanceApiUrl = "https://attendance-api.example";
  const noPerm = await request(appAs({ ...owner, permissions: [] })).get("/api/v1/attendance/summary");
  assert.equal(noPerm.status, 403);
  env.attendanceSsoSecret = "";
  const off = await request(appAs(viewer)).get("/api/v1/attendance/summary");
  assert.equal(off.status, 503);
});

test("attendance summary: signs a short service token for this restaurant and passes date/outlet", async () => {
  env.attendanceSsoSecret = "x".repeat(40);
  env.attendanceAppUrl = "https://attendance.dinexpos.in";
  env.attendanceApiUrl = "https://attendance-api.example/";
  let seen;
  await withFetch(
    async (url, opts) => {
      seen = { url, auth: opts.headers.Authorization };
      return { ok: true, status: 200, json: async () => ({ day: { present: 3 } }) };
    },
    async () => {
      const res = await request(appAs(viewer)).get("/api/v1/attendance/summary?date=2026-10-11&outletId=o1&evil=1");
      assert.equal(res.status, 200);
      assert.equal(res.body.day.present, 3);
    }
  );
  assert.equal(seen.url, "https://attendance-api.example/api/partner/dinexpos/summary?date=2026-10-11&outletId=o1");
  const payload = jwt.verify(seen.auth.replace("Bearer ", ""), env.attendanceSsoSecret, {
    issuer: "dinexpos",
    audience: "plato-attendance-summary"
  });
  assert.equal(payload.tenantId, "t-123");
  assert.ok(payload.exp - payload.iat <= 60);
  // A summary token is never accepted as a login ticket (different audience).
  assert.throws(() => jwt.verify(seen.auth.replace("Bearer ", ""), env.attendanceSsoSecret, { audience: "plato-attendance" }));
});

test("attendance summary: Attendance down or not connected → clear message, never a crash", async () => {
  env.attendanceSsoSecret = "x".repeat(40);
  env.attendanceAppUrl = "https://attendance.dinexpos.in";
  env.attendanceApiUrl = "https://attendance-api.example";
  await withFetch(
    async () => {
      throw new Error("ECONNREFUSED");
    },
    async () => {
      const res = await request(appAs(viewer)).get("/api/v1/attendance/summary");
      assert.equal(res.status, 503);
    }
  );
  await withFetch(
    async () => ({ ok: false, status: 404, json: async () => ({ error: "Attendance is not connected yet." }) }),
    async () => {
      const res = await request(appAs(viewer)).get("/api/v1/attendance/summary?date=bad");
      assert.equal(res.status, 404);
      assert.match(JSON.stringify(res.body), /not connected/);
    }
  );
});
