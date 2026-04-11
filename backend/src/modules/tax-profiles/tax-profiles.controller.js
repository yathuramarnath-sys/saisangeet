const { fetchTaxProfiles, createTaxProfile } = require("./tax-profiles.service");

async function listTaxProfilesHandler(_req, res) {
  const result = await fetchTaxProfiles();
  res.json(result);
}

async function createTaxProfileHandler(req, res) {
  const result = await createTaxProfile(req.body);
  res.status(201).json(result);
}

module.exports = {
  listTaxProfilesHandler,
  createTaxProfileHandler
};
