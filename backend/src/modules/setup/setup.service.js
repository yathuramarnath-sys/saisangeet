const { getOwnerSetupData } = require("../../data/owner-setup-store");

async function fetchAppConfig() {
  const data = getOwnerSetupData();

  return {
    businessProfile: data.businessProfile,
    outlets: data.outlets,
    roles: data.roles,
    taxProfiles: data.taxProfiles,
    receiptTemplates: data.receiptTemplates,
    devices: data.devices,
    menu: data.menu
  };
}

module.exports = {
  fetchAppConfig
};
