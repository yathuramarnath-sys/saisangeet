const { fetchTaxProfiles, createTaxProfile, updateTaxProfile, deleteTaxProfile } = require("./tax-profiles.service");

async function listTaxProfilesHandler(_req, res) {
  const result = await fetchTaxProfiles();
  res.json(result);
}

async function createTaxProfileHandler(req, res) {
  const result = await createTaxProfile(req.body);
  res.status(201).json(result);
}

async function updateTaxProfileHandler(req, res) {
  const result = await updateTaxProfile(req.params.id, req.body);
  if (!result) return res.status(404).json({ error: "Tax profile not found" });
  res.json(result);
}

async function deleteTaxProfileHandler(req, res) {
  const deleted = await deleteTaxProfile(req.params.id);
  if (!deleted) return res.status(404).json({ error: "Tax profile not found" });
  res.json({ deleted: true });
}

module.exports = {
  listTaxProfilesHandler,
  createTaxProfileHandler,
  updateTaxProfileHandler,
  deleteTaxProfileHandler,
};
