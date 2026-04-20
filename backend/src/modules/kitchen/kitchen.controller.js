const {
  listKitchenStations,
  createKitchenStation,
  updateKitchenStation,
  deleteKitchenStation
} = require("./kitchen.service");

async function listHandler(req, res) {
  const stations = await listKitchenStations();
  res.json(stations);
}

async function createHandler(req, res) {
  const station = await createKitchenStation(req.body);
  res.status(201).json(station);
}

async function updateHandler(req, res) {
  const station = await updateKitchenStation(req.params.id, req.body);
  res.json(station);
}

async function deleteHandler(req, res) {
  const result = await deleteKitchenStation(req.params.id);
  res.json(result);
}

module.exports = { listHandler, createHandler, updateHandler, deleteHandler };
