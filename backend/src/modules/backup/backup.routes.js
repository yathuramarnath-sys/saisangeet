const express = require("express");
const { asyncHandler } = require("../../utils/async-handler");
const { requireAuth }  = require("../../middleware/require-auth");
const { exportAllData } = require("./backup.service");

const backupRouter = express.Router();

/**
 * GET /backup/download
 * Returns the full tenant data as a JSON file attachment.
 * Requires owner auth (Bearer token).
 */
backupRouter.get("/download", requireAuth, asyncHandler(async (_req, res) => {
  const data      = await exportAllData();
  const json      = JSON.stringify(data, null, 2);
  const filename  = `plato-backup-${new Date().toISOString().slice(0, 10)}.json`;

  res.setHeader("Content-Type",        "application/json");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.setHeader("Content-Length",      Buffer.byteLength(json, "utf8"));
  res.send(json);
}));

module.exports = { backupRouter };
