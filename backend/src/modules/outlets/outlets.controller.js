const {
  fetchOutlets,
  createOutlet,
  updateOutletSettings
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

module.exports = {
  listOutletsHandler,
  createOutletHandler,
  updateOutletSettingsHandler
};
