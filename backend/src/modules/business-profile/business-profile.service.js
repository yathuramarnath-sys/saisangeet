const { ApiError } = require("../../utils/api-error");
const { getOwnerSetupData, updateOwnerSetupData } = require("../../data/owner-setup-store");

async function fetchBusinessProfile() {
  const profile = getOwnerSetupData().businessProfile;

  if (!profile) {
    throw new ApiError(404, "BUSINESS_PROFILE_NOT_FOUND", "Business profile not found");
  }

  return profile;
}

async function updateBusinessProfile(payload) {
  const nextData = updateOwnerSetupData((current) => ({
    ...current,
    businessProfile: {
      ...current.businessProfile,
      ...payload
    }
  }));

  return nextData.businessProfile;
}

module.exports = {
  fetchBusinessProfile,
  updateBusinessProfile
};
