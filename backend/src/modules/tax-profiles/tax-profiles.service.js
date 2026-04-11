const { listTaxProfiles } = require("./tax-profiles.repository");

async function fetchTaxProfiles() {
  return listTaxProfiles();
}

async function createTaxProfile(payload) {
  return {
    message: "Create tax profile implementation pending",
    payload
  };
}

module.exports = {
  fetchTaxProfiles,
  createTaxProfile
};
