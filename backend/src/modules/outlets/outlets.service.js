const { getOwnerSetupData, updateOwnerSetupData } = require("../../data/owner-setup-store");

async function fetchOutlets() {
  return getOwnerSetupData().outlets;
}

/**
 * Auto-generate a unique outlet sync code from the city (or outlet name).
 * Format: up to 4 uppercase letters from the city + "-" + 4-digit number starting at 1001.
 * Example: city "Mumbai" → "MUM-1001", city "Indore" → "INDR-1001"
 */
function generateOutletCode(name, city, existingOutlets) {
  const source = (city || name || "OUT").replace(/[^A-Za-z]/g, "").toUpperCase();
  const prefix  = source.slice(0, 4);
  const usedCodes = (existingOutlets || []).map((o) => (o.code || "").toUpperCase());
  let num = 1001;
  while (usedCodes.includes(`${prefix}-${num}`)) {
    num++;
  }
  return `${prefix}-${num}`;
}

async function createOutlet(payload) {
  const existingOutlets = getOwnerSetupData().outlets || [];
  const code = generateOutletCode(payload.name, payload.city, existingOutlets);

  const outlet = {
    id: `outlet-${Date.now()}`,
    code,
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
