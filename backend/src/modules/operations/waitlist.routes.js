const express = require("express");
const { requireAuth } = require("../../middleware/require-auth");
const { asyncHandler } = require("../../utils/async-handler");
const {
  addToWaitlist, getWaitlist, updateWaitlistEntry, getWaitlistHistory,
  getSettings, saveOutletSettings, calcEstimatedWait, getCurrentPeriodTurnover,
} = require("./waitlist-store");
const { sendSMS, msgJoinQueue, msgTableReady, msgCancelled } = require("../../services/sms.service");

const waitlistRouter = express.Router();

// GET /operations/waitlist?outletId=
// Returns today's waiting queue for the outlet
waitlistRouter.get("/", requireAuth, asyncHandler(async (req, res) => {
  const tenantId = req.user?.tenantId || "default";
  const { outletId } = req.query;
  if (!outletId) return res.status(400).json({ error: "outletId required" });
  const queue = getWaitlist(tenantId, outletId);
  res.json(queue);
}));

// POST /operations/waitlist
// Add a party to the waitlist, calculate wait, send SMS
// Body: { outletId, outletName, name, phone, partySize, occupiedTables }
// occupiedTables: [{ seats, startedAt }] — sent by POS from its live order state
waitlistRouter.post("/", requireAuth, asyncHandler(async (req, res) => {
  const tenantId = req.user?.tenantId || "default";
  const { outletId, outletName, name, phone, partySize, occupiedTables = [] } = req.body;

  if (!outletId || !name || !partySize) {
    return res.status(400).json({ error: "outletId, name and partySize required" });
  }

  const settings     = getSettings(tenantId, outletId);
  const waitingAhead = getWaitlist(tenantId, outletId);
  const waitRange    = calcEstimatedWait(Number(partySize), occupiedTables, waitingAhead, settings);

  const entry = addToWaitlist(tenantId, {
    outletId,
    outletName:    outletName || "",
    name:          String(name).trim(),
    phone:         String(phone || "").trim(),
    partySize:     Number(partySize),
    estimatedWait: waitRange,
  });

  // Fire-and-forget SMS
  if (phone) {
    const { period } = getCurrentPeriodTurnover(settings);
    sendSMS(phone, msgJoinQueue({
      name:       entry.name,
      queueNumber: entry.queueNumber,
      outletName: outletName || "the restaurant",
      waitMin:    waitRange.min || waitRange.mins || 10,
      waitMax:    waitRange.max || (waitRange.mins || 10) + 10,
    })).catch(() => {});
  }

  // Notify all POS terminals in this outlet
  const io = req.app.locals.io;
  if (io) io.to(`tenant:${tenantId}`).emit("waitlist:updated", { outletId });

  res.status(201).json(entry);
}));

// PATCH /operations/waitlist/:id/seat
// Mark party as seated, send "table ready" SMS
// Body: { assignedTableId, assignedTableLabel }
waitlistRouter.patch("/:id/seat", requireAuth, asyncHandler(async (req, res) => {
  const tenantId = req.user?.tenantId || "default";
  const { assignedTableId, assignedTableLabel } = req.body;

  const updated = updateWaitlistEntry(tenantId, req.params.id, {
    status:             "seated",
    assignedTableId:    assignedTableId || null,
    assignedTableLabel: assignedTableLabel || null,
    seatedAt:           new Date().toISOString(),
  });

  if (!updated) return res.status(404).json({ error: "Waitlist entry not found" });

  if (updated.phone) {
    sendSMS(updated.phone, msgTableReady({
      name:       updated.name,
      outletName: updated.outletName || "the restaurant",
      tableLabel: assignedTableLabel,
    })).catch(() => {});
  }

  const io = req.app.locals.io;
  if (io) io.to(`tenant:${tenantId}`).emit("waitlist:updated", { outletId: updated.outletId });

  res.json(updated);
}));

// PATCH /operations/waitlist/:id/no-show
waitlistRouter.patch("/:id/no-show", requireAuth, asyncHandler(async (req, res) => {
  const tenantId = req.user?.tenantId || "default";
  const updated  = updateWaitlistEntry(tenantId, req.params.id, {
    status:    "no_show",
    noShowAt:  new Date().toISOString(),
  });
  if (!updated) return res.status(404).json({ error: "Waitlist entry not found" });

  const io = req.app.locals.io;
  if (io) io.to(`tenant:${tenantId}`).emit("waitlist:updated", { outletId: updated.outletId });

  res.json(updated);
}));

// PATCH /operations/waitlist/:id/cancel
waitlistRouter.patch("/:id/cancel", requireAuth, asyncHandler(async (req, res) => {
  const tenantId = req.user?.tenantId || "default";
  const updated  = updateWaitlistEntry(tenantId, req.params.id, {
    status:      "cancelled",
    cancelledAt: new Date().toISOString(),
  });
  if (!updated) return res.status(404).json({ error: "Waitlist entry not found" });

  if (updated.phone) {
    sendSMS(updated.phone, msgCancelled({
      name:       updated.name,
      outletName: updated.outletName || "the restaurant",
    })).catch(() => {});
  }

  const io = req.app.locals.io;
  if (io) io.to(`tenant:${tenantId}`).emit("waitlist:updated", { outletId: updated.outletId });

  res.json(updated);
}));

// GET /operations/waitlist/history?outletId=&dateFrom=&dateTo=
waitlistRouter.get("/history", requireAuth, asyncHandler(async (req, res) => {
  const tenantId = req.user?.tenantId || "default";
  const { outletId, dateFrom, dateTo } = req.query;
  const history = getWaitlistHistory(tenantId, outletId, dateFrom, dateTo);
  res.json(history);
}));

// GET /operations/waitlist/settings?outletId=
waitlistRouter.get("/settings", requireAuth, asyncHandler(async (req, res) => {
  const tenantId = req.user?.tenantId || "default";
  const { outletId } = req.query;
  res.json(getSettings(tenantId, outletId || "default"));
}));

// PUT /operations/waitlist/settings
// Body: { outletId, breakfast, lunch, snacks, dinner, ...period times }
waitlistRouter.put("/settings", requireAuth, asyncHandler(async (req, res) => {
  const tenantId = req.user?.tenantId || "default";
  const { outletId, ...patch } = req.body;
  const updated = saveOutletSettings(tenantId, outletId || "default", patch);
  res.json(updated);
}));

module.exports = waitlistRouter;
