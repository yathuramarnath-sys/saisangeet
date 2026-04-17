const { getOwnerSetupData, updateOwnerSetupData } = require("../../data/owner-setup-store");

async function fetchTaxProfiles() {
  return getOwnerSetupData().taxProfiles;
}

async function createTaxProfile(payload) {
  const profile = {
    id: `tax-${Date.now()}`,
    name: payload.name,
    cgstRate: Number(payload.cgstRate || 0),
    sgstRate: Number(payload.sgstRate || 0),
    igstRate: Number(payload.igstRate || 0),
    cessRate: Number(payload.cessRate || 0),
    isInclusive: Boolean(payload.isInclusive),
    isDefault: Boolean(payload.isDefault)
  };

  updateOwnerSetupData((current) => ({
    ...current,
    taxProfiles: current.taxProfiles
      .map((item) => ({
        ...item,
        isDefault: profile.isDefault ? false : item.isDefault
      }))
      .concat(profile)
  }));

  return profile;
}

module.exports = {
  fetchTaxProfiles,
  createTaxProfile
};
