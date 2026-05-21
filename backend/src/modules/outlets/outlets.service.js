const { getOwnerSetupData, updateOwnerSetupData } = require("../../data/owner-setup-store");

/**
 * Generate a permanent, human-readable sync code for an outlet.
 * Format: 4 chars + "-" + 4 chars, e.g. "CAFE-X7K2"
 * Uses an unambiguous character set (no O/0, I/1 confusion).
 */
function generateSyncCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const r = (n) =>
    Array.from({ length: n }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
  return `${r(4)}-${r(4)}`;
}

async function fetchOutlets() {
  const data = getOwnerSetupData();
  const bp   = data.businessProfile || {};
  // Merge business-profile receipt fields into each outlet so POS/Captain
  // can print a complete bill header without a separate API call.
  return (data.outlets || []).map(o => ({
    ...o,
    phone:         o.phone         || bp.phone         || "",
    addressLine1:  o.addressLine1  || bp.addressLine1  || "",
    addressLine2:  o.addressLine2  || bp.addressLine2  || "",
    city:          o.city          || bp.city          || "",
    state:         o.state         || bp.state         || "",
    gstin:         o.gstin         || bp.gstin         || "",
    fssaiNo:       o.fssaiNo       || bp.fssaiNo       || "",
    invoiceHeader: o.invoiceHeader || bp.invoiceHeader || "",
    invoiceFooter: o.invoiceFooter || bp.invoiceFooter || "",
  }));
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
    syncCode: generateSyncCode(),
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

/**
 * Generate and persist a fresh syncCode for an outlet.
 * Called when owner clicks "Regenerate" on the Outlets page.
 */
async function regenerateOutletSyncCode(id) {
  const newCode = generateSyncCode();
  let updatedOutlet = null;

  updateOwnerSetupData((current) => ({
    ...current,
    outlets: current.outlets.map((outlet) => {
      if (outlet.id !== id) return outlet;
      updatedOutlet = { ...outlet, syncCode: newCode };
      return updatedOutlet;
    })
  }));

  return updatedOutlet || null;
}

module.exports = {
  fetchOutlets,
  createOutlet,
  updateOutletSettings,
  deleteOutlet,
  regenerateOutletSyncCode,
  generateOutletCode,
  generateSyncCode,
};
