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
