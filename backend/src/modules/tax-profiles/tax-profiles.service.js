const { getOwnerSetupData, updateOwnerSetupData, updateOwnerSetupDataNow } = require("../../data/owner-setup-store");

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

async function updateTaxProfile(id, payload) {
  let updatedProfile = null;

  await updateOwnerSetupDataNow((current) => ({
    ...current,
    taxProfiles: current.taxProfiles.map((tp) => {
      if (tp.id !== id) return tp;
      updatedProfile = {
        ...tp,
        name:        payload.name        ?? tp.name,
        cgstRate:    payload.cgstRate    !== undefined ? Number(payload.cgstRate)    : tp.cgstRate,
        sgstRate:    payload.sgstRate    !== undefined ? Number(payload.sgstRate)    : tp.sgstRate,
        igstRate:    payload.igstRate    !== undefined ? Number(payload.igstRate)    : tp.igstRate,
        cessRate:    payload.cessRate    !== undefined ? Number(payload.cessRate)    : tp.cessRate,
        isInclusive: payload.isInclusive !== undefined ? Boolean(payload.isInclusive): tp.isInclusive,
        isDefault:   payload.isDefault   !== undefined ? Boolean(payload.isDefault)  : tp.isDefault,
      };
      return updatedProfile;
    })
  }));

  return updatedProfile || null;
}

module.exports = {
  fetchTaxProfiles,
  createTaxProfile,
  updateTaxProfile,
};
