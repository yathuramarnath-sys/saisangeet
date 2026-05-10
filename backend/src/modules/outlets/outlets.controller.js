const {
  fetchOutlets,
  createOutlet,
  updateOutletSettings,
  deleteOutlet
} = require("./outlets.service");

function pushSync(req, type = "outlets") {
  const io       = req.app.locals.io;
  const tenantId = req.user?.tenantId || "default";
  // Scope to tenant room — prevents config events leaking to other tenants
  if (io) io.to(`tenant:${tenantId}`).emit("sync:config", { type, ts: Date.now() });
}

async function listOutletsHandler(_req, res) {
  const result = await fetchOutlets();
  res.json(result);
}

async function createOutletHandler(req, res) {
  const result = await createOutlet(req.body);
  pushSync(req);
  res.status(201).json(result);
}

async function updateOutletSettingsHandler(req, res) {
  const result = await updateOutletSettings(req.params.id, req.body);
  pushSync(req);
  res.json(result);
}

// Tables-only update — accepts { tables: [...] } from POS cashier
async function updateOutletTablesHandler(req, res) {
  const { tables } = req.body;
  if (!Array.isArray(tables)) {
    return res.status(400).json({ error: "tables must be an array" });
  }
  const result = await updateOutletSettings(req.params.id, { tables });
  pushSync(req, "tables");
  res.json(result);
}

async function deleteOutletHandler(req, res) {
  const result = await deleteOutlet(req.params.id);
  pushSync(req);
  res.json(result);
}

module.exports = {
  listOutletsHandler,
  createOutletHandler,
  updateOutletSettingsHandler,
  updateOutletTablesHandler,
  deleteOutletHandler
};
