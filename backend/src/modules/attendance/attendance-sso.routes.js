/**
 * Plato Attendance — single sign-on ticket.
 *
 * The owner console calls POST /api/v1/attendance/sso-ticket and opens the
 * returned URL in a new tab. The Attendance app (separate product, separate
 * database) verifies the ticket with the shared secret and logs the owner in.
 *
 * Read-only: this module never changes POS data. It is inactive unless both
 * ATTENDANCE_SSO_SECRET and ATTENDANCE_APP_URL are set.
 */

const crypto = require("crypto");
const express = require("express");
const jwt = require("jsonwebtoken");

const { env } = require("../../config/env");
const { requireAuth } = require("../../middleware/require-auth");
const { asyncHandler } = require("../../utils/async-handler");
const { ApiError } = require("../../utils/api-error");
const { getOwnerSetupData } = require("../../data/owner-setup-store");

const attendanceRouter = express.Router();

const TICKET_SECONDS = 120;

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

module.exports = { attendanceRouter };
