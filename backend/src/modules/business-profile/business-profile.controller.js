const {
  fetchBusinessProfile,
  updateBusinessProfile
} = require("./business-profile.service");

async function getBusinessProfileHandler(_req, res) {
  const result = await fetchBusinessProfile();
  res.json(result);
}

async function updateBusinessProfileHandler(req, res) {
  const result = await updateBusinessProfile(req.body);
  res.json(result);
}

module.exports = {
  getBusinessProfileHandler,
  updateBusinessProfileHandler
};
