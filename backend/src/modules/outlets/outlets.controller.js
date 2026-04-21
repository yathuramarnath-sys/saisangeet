const {
  fetchOutlets,
  createOutlet,
  updateOutletSettings,
  deleteOutlet
} = require("./outlets.service");

function pushSync(req, type = "outlets") {
  const io = req.app.locals.io;
  if (io) io.emit("sync:config", { type, ts: Date.now() });
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

async function deleteOutletHandler(req, res) {
  const result = await deleteOutlet(req.params.id);
  pushSync(req);
  res.json(result);
}

module.exports = {
  listOutletsHandler,
  createOutletHandler,
  updateOutletSettingsHandler,
  deleteOutletHandler
};
