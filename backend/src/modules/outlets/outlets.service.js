const { getOwnerSetupData, updateOwnerSetupData } = require("../../data/owner-setup-store");

async function fetchOutlets() {
  return getOwnerSetupData().outlets;
}

async function createOutlet(payload) {
  const outlet = {
    id: `outlet-${Date.now()}`,
    code: payload.code,
    name: payload.name,
    gstin: payload.gstin || "",
    city: payload.city || "",
    state: payload.state || "",
    isActive: payload.isActive ?? true,
    hours: payload.hours || "9:00 AM - 11:00 PM",
    services: payload.services || ["Dine-in", "Takeaway"],
    workAreas: payload.workAreas || ["AC", "Non-AC", "Self Service"],
    tables: payload.tables || [],
    reportEmail: payload.reportEmail || "",
    defaultTaxProfileId: payload.defaultTaxProfileId || null,
    receiptTemplateId: payload.receiptTemplateId || null
  };

  updateOwnerSetupData((current) => ({
    ...current,
    outlets: [...current.outlets, outlet]
  }));

  return outlet;
}

async function updateOutletSettings(id, payload) {
  let updatedOutlet = null;

  updateOwnerSetupData((current) => ({
    ...current,
    outlets: current.outlets.map((outlet) => {
      if (outlet.id !== id) {
        return outlet;
      }

      updatedOutlet = {
        ...outlet,
        ...payload
      };
      return updatedOutlet;
    })
  }));

  return updatedOutlet || null;
}

async function deleteOutlet(id) {
  updateOwnerSetupData((current) => ({
    ...current,
    outlets: current.outlets.filter((outlet) => outlet.id !== id)
  }));
  return { ok: true };
}

module.exports = {
  fetchOutlets,
  createOutlet,
  updateOutletSettings,
  deleteOutlet
};
