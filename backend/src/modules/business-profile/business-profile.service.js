const { ApiError } = require("../../utils/api-error");
const { getOwnerSetupData, updateOwnerSetupData } = require("../../data/owner-setup-store");
const { generateOutletCode, generateSyncCode } = require("../outlets/outlets.service");

async function fetchBusinessProfile() {
  const profile = getOwnerSetupData().businessProfile;

  if (!profile) {
    throw new ApiError(404, "BUSINESS_PROFILE_NOT_FOUND", "Business profile not found");
  }

  return profile;
}

async function updateBusinessProfile(payload) {
  const nextData = updateOwnerSetupData((current) => {
    const updatedProfile = {
      ...current.businessProfile,
      ...payload,
    };

    // Auto-create the first outlet from Business Profile data
    // Only fires when the account has no outlets configured yet.
    // Existing accounts with outlets are completely unaffected.
    let outlets = current.outlets || [];
    if (outlets.length === 0 && (updatedProfile.tradeName || updatedProfile.legalName)) {
      const outletName = updatedProfile.tradeName || updatedProfile.legalName;

      // Pick defaults from existing tax profiles and receipt templates so the
      // auto-created outlet passes the "needsReview" check immediately.
      const taxProfiles      = current.taxProfiles      || [];
      const receiptTemplates = current.receiptTemplates || [];
      const defaultTax       = taxProfiles.find((t) => t.isDefault) || taxProfiles[0];
      const defaultReceipt   = receiptTemplates[0];

      outlets = [{
        id:                   `outlet-${Date.now()}`,
        code:                 generateOutletCode(outletName, updatedProfile.city || "", []),
        syncCode:             generateSyncCode(),
        name:                 outletName,
        city:                 updatedProfile.city        || "",
        state:                updatedProfile.state       || "",
        gstin:                updatedProfile.gstin       || "",
        phone:                updatedProfile.phone       || "",
        reportEmail:          updatedProfile.email       || "",
        isActive:             true,
        hours:                "9:00 AM - 11:00 PM",
        services:             ["Dine-in", "Takeaway", "Delivery"],
        workAreas:            ["AC", "Non-AC", "Self Service"],
        tables:               [],
        defaultTaxProfileId:  defaultTax?.id     || null,
        receiptTemplateId:    defaultReceipt?.id || null,
        _autoCreatedFromProfile: true,
      }];
    }

    return {
      ...current,
      businessProfile: updatedProfile,
      outlets,
    };
  });

  return nextData.businessProfile;
}

module.exports = {
  fetchBusinessProfile,
  updateBusinessProfile
};
