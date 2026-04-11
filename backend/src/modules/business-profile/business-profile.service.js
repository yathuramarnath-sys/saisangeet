const { ApiError } = require("../../utils/api-error");
const { getBusinessProfile } = require("./business-profile.repository");

async function fetchBusinessProfile() {
  const profile = await getBusinessProfile();

  if (!profile) {
    throw new ApiError(404, "BUSINESS_PROFILE_NOT_FOUND", "Business profile not found");
  }

  return profile;
}

async function updateBusinessProfile(payload) {
  return {
    message: "Update business profile implementation pending",
    payload
  };
}

module.exports = {
  fetchBusinessProfile,
  updateBusinessProfile
};
