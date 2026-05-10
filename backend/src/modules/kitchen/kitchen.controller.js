const {
  listKitchenStations,
  createKitchenStation,
  updateKitchenStation,
  deleteKitchenStation
} = require("./kitchen.service");

function pushSync(req, type = "stations") {
  const io       = req.app.locals.io;
  const tenantId = req.user?.tenantId || "default";
  // Scope to tenant room — prevents station-change events leaking to other tenants
  if (io) io.to(`tenant:${tenantId}`).emit("sync:config", { type, ts: Date.now() });
}

async function listHandler(req, res) {
  const stations = await listKitchenStations();
  res.json(stations);
}

async function createHandler(req, res) {
  const station = await createKitchenStation(req.body);
  pushSync(req);
  res.status(201).json(station);
}

async function updateHandler(req, res) {
  const station = await updateKitchenStation(req.params.id, req.body);
  pushSync(req);
  res.json(station);
}

async function deleteHandler(req, res) {
  const result = await deleteKitchenStation(req.params.id);
  pushSync(req);
  res.json(result);
}

module.exports = { listHandler, createHandler, updateHandler, deleteHandler };
