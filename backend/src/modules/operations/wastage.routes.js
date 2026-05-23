/**
 * wastage.routes.js
 * POST /operations/wastage   — log a wastage entry (POS)
 * GET  /operations/wastage   — fetch entries by date range (Owner Web Reports)
 */
const express = require("express");
const router  = express.Router();
const { authenticate } = require("../../middleware/authenticate");
const { addWastageEntry, getWastageForRange } = require("./wastage-store");

/* POST /operations/wastage */
router.post("/", authenticate, (req, res) => {
  const tenantId = req.user?.tenantId || "default";
  const {
    id, itemName, unit = "", quantity, reason,
    note = "", shiftId = "", cashierName = "",
    outletId = "", timestamp
  } = req.body;

  if (!itemName || !itemName.trim()) {
    return res.status(400).json({ error: "itemName is required." });
  }
  if (!quantity || Number(quantity) <= 0) {
    return res.status(400).json({ error: "quantity must be > 0." });
  }

  const entry = {
    id:          id || `wst-${Date.now()}`,
    itemName:    String(itemName).trim(),
    unit:        String(unit || "").trim(),
    quantity:    Number(quantity),
    reason:      String(reason || "Other").trim(),
    note:        String(note || "").trim(),
    shiftId:     String(shiftId || ""),
    cashierName: String(cashierName || ""),
    outletId:    String(outletId || ""),
    timestamp:   timestamp || new Date().toISOString(),
  };

  addWastageEntry(tenantId, entry);
  res.status(201).json(entry);
});

/* GET /operations/wastage?dateFrom=YYYY-MM-DD&dateTo=YYYY-MM-DD&outletId= */
router.get("/", authenticate, (req, res) => {
  const tenantId = req.user?.tenantId || "default";
  const today    = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  const { dateFrom = today, dateTo = today, outletId = "" } = req.query;

  const entries = getWastageForRange(tenantId, dateFrom, dateTo, outletId || null);
  res.json(entries);
});

module.exports = router;
