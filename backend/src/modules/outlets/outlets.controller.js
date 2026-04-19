const {
  fetchOutlets,
  createOutlet,
  updateOutletSettings,
  deleteOutlet
} = require("./outlets.service");

async function listOutletsHandler(_req, res) {
  const result = await fetchOutlets();
  res.json(result);
}

async function createOutletHandler(req, res) {
  const result = await createOutlet(req.body);
  res.status(201).json(result);
}

async function updateOutletSettingsHandler(req, res) {
  const result = await updateOutletSettings(req.params.id, req.body);
  res.json(result);
}

async function deleteOutletHandler(req, res) {
  const result = await deleteOutlet(req.params.id);
  res.json(result);
}

module.exports = {
  listOutletsHandler,
  createOutletHandler,
  updateOutletSettingsHandler,
  deleteOutletHandler
};
