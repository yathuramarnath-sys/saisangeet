/**
 * Plato Attendance — single sign-on ticket.
 *
 * The owner console calls POST /api/v1/attendance/sso-ticket and opens the
 * returned URL in a new tab. The Attendance app (separate product, separate
 * database) verifies the ticket with the shared secret and logs the owner in.
 *
 * GET /api/v1/attendance/summary is for the owner app's Attendance tab: this
 * server asks Attendance for a read-only summary (today's staff + salary cost,
 * last month's salary total) with a 60-second service token. The phone never
 * gets an Attendance login. If Attendance is slow or down, only that tab says so.
 *
 * Read-only: this module never changes POS data. It is inactive unless both
 * ATTENDANCE_SSO_SECRET and ATTENDANCE_APP_URL are set.
 */

const crypto = require("crypto");
const express = require("express");
const jwt = require("jsonwebtoken");

const { env } = require("../../config/env");
const { requireAuth } = require("../../middleware/require-auth");
const { requirePermission } = require("../../middleware/require-permission");
const { asyncHandler } = require("../../utils/async-handler");
const { ApiError } = require("../../utils/api-error");
const { getOwnerSetupData } = require("../../data/owner-setup-store");

const attendanceRouter = express.Router();

const TICKET_SECONDS = 120;
const SUMMARY_TIMEOUT_MS = 6000;

attendanceRouter.post(
  "/sso-ticket",
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!env.attendanceSsoSecret || !env.attendanceAppUrl) {
      throw new ApiError(503, "ATTENDANCE_NOT_CONFIGURED", "Attendance is not set up yet");
    }
    if (!(req.user.roles || []).includes("Owner")) {
      throw new ApiError(403, "OWNER_ONLY", "Only the owner can open Attendance from here");
    }

    const data = getOwnerSetupData();
    const user = (data.users || []).find((u) => u.id === req.user.sub) || {};
    const bp = data.businessProfile || {};
    const outlets = (data.outlets || [])
      .filter((o) => o.isActive !== false)
      .map((o) => ({ id: String(o.id), name: String(o.name || "Outlet").slice(0, 80) }));

    const ticket = jwt.sign(
      {
        tenantId: String(req.user.tenantId),
        userId: String(req.user.sub || ""),
        email: user.email || null,
        name: user.fullName || req.user.fullName || "Owner",
        businessName: bp.tradeName || bp.legalName || "My Restaurant",
        outlets
      },
      env.attendanceSsoSecret,
      {
        algorithm: "HS256",
        issuer: "dinexpos",
        audience: "plato-attendance",
        expiresIn: TICKET_SECONDS,
        jwtid: crypto.randomUUID()
      }
    );

    const base = env.attendanceAppUrl.replace(/\/$/, "");
    // Ticket goes in the URL fragment (#), which browsers never send to servers or logs.
    res.json({ url: `${base}/sso#ticket=${encodeURIComponent(ticket)}` });
  })
);

attendanceRouter.get(
  "/summary",
  requireAuth,
  requirePermission("reports.view"),
  asyncHandler(async (req, res) => {
    if (!env.attendanceSsoSecret || !env.attendanceAppUrl || !env.attendanceApiUrl) {
      throw new ApiError(503, "ATTENDANCE_NOT_CONFIGURED", "Attendance is not set up yet");
    }
    const token = jwt.sign({ tenantId: String(req.user.tenantId) }, env.attendanceSsoSecret, {
      algorithm: "HS256",
      issuer: "dinexpos",
      audience: "plato-attendance-summary",
      expiresIn: 60
    });
    const params = new URLSearchParams();
    if (typeof req.query.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(req.query.date)) params.set("date", req.query.date);
    if (typeof req.query.outletId === "string" && req.query.outletId.length <= 100) params.set("outletId", req.query.outletId);
    const qs = params.toString();
    const url = `${env.attendanceApiUrl.replace(/\/$/, "")}/api/partner/dinexpos/summary${qs ? `?${qs}` : ""}`;

    let upstream;
    try {
      upstream = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(SUMMARY_TIMEOUT_MS)
      });
    } catch (_err) {
      throw new ApiError(503, "ATTENDANCE_UNAVAILABLE", "Attendance is not reachable right now");
    }
    const body = await upstream.json().catch(() => null);
    if (!upstream.ok) {
      const status = upstream.status === 404 || upstream.status === 400 ? upstream.status : 503;
      throw new ApiError(status, "ATTENDANCE_ERROR", (body && body.error) || "Attendance is not available right now");
    }
    res.json(body);
  })
);

module.exports = { attendanceRouter };
