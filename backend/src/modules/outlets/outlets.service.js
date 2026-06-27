const { getOwnerSetupData, updateOwnerSetupData, updateOwnerSetupDataNow } = require("../../data/owner-setup-store");

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
  const taxProfiles = data.taxProfiles || [];

  return (data.outlets || []).map(o => {
    // Resolve default tax rate (CGST + SGST) from the outlet's defaultTaxProfileId.
    // This is used as a per-item fallback in printBill.js when item.taxRate is null/empty.
    const defaultProfile = o.defaultTaxProfileId
      ? taxProfiles.find(tp => tp.id === o.defaultTaxProfileId)
      : (taxProfiles.find(tp => tp.isDefault) || taxProfiles[0]);
    const defaultTaxRate = defaultProfile
      ? (Number(defaultProfile.cgstRate || 0) + Number(defaultProfile.sgstRate || 0))
      : 0;

    return {
      ...o,
      phone:          o.phone         || bp.phone         || "",
      addressLine1:   o.addressLine1  || bp.addressLine1  || "",
      addressLine2:   o.addressLine2  || bp.addressLine2  || "",
      city:           o.city          || bp.city          || "",
      state:          o.state         || bp.state         || "",
      gstin:          o.gstin         || bp.gstin         || "",
      fssaiNo:        o.fssaiNo       || bp.fssaiNo       || "",
      upiId:          o.upiId         || "",
      showFssai:      o.showFssai     ?? true,
      showQR:         o.showQR        ?? true,
      gstTreatment:   o.gstTreatment  || "exclusive",
      invoiceHeader:  o.invoiceHeader || bp.invoiceHeader || "",
      invoiceFooter:  o.invoiceFooter || bp.invoiceFooter || "",
      dynoSwiggyId:   o.dynoSwiggyId  || "",   // ← Dyno APIs Swiggy restaurant id
      dynoZomatoId:   o.dynoZomatoId  || "",   // ← Dyno APIs Zomato restaurant id
      defaultTaxRate,   // ← resolved numeric rate (e.g. 5 for GST 5%), used as bill fallback
    };
  });
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
    fssaiNo:     payload.fssaiNo    || "",
    upiId:       payload.upiId      || "",
    dynoSwiggyId: payload.dynoSwiggyId || "",
    dynoZomatoId: payload.dynoZomatoId || "",
    defaultTaxProfileId: payload.defaultTaxProfileId || null,
    receiptTemplateId: payload.receiptTemplateId || null
  };

  await updateOwnerSetupDataNow((current) => ({
    ...current,
    outlets: [...current.outlets, outlet]
  }));

  return outlet;
}

async function updateOutletSettings(id, payload) {
  let updatedOutlet = null;
  let oldName = null;

  // Use updateOwnerSetupDataNow (awaitable Postgres write) so outlet settings like
  // gstTreatment, showGstBreakdown etc. survive a Railway server restart immediately.
  // Previously updateOwnerSetupData (fire-and-forget) could lose changes if the
  // server restarted before the async Postgres write completed.
  await updateOwnerSetupDataNow((current) => {
    const outlets = current.outlets.map((outlet) => {
      if (outlet.id !== id) return outlet;
      oldName = outlet.name;
      updatedOutlet = { ...outlet, ...payload };
      return updatedOutlet;
    });

    // When outlet is renamed, cascade the new name to every place that references
    // the old name: menu item availability, linked devices, and staff assignments.
    const nameChanged = payload.name && oldName && payload.name !== oldName;

    if (!nameChanged) {
      return { ...current, outlets };
    }

    const menuItems = (current.menu?.items || []).map(item => ({
      ...item,
      outletAvailability: (item.outletAvailability || []).map(a =>
        a.outlet === oldName ? { ...a, outlet: payload.name } : a
      )
    }));

    const devices = (current.devices || []).map(d =>
      d.outletName === oldName ? { ...d, outletName: payload.name } : d
    );

    const users = (current.users || []).map(u =>
      u.outletName === oldName ? { ...u, outletName: payload.name } : u
    );

    const discounts = (current.discounts || []).map(disc =>
      disc.outletScope === oldName ? { ...disc, outletScope: payload.name } : disc
    );

    return {
      ...current,
      outlets,
      menu:      { ...current.menu, items: menuItems },
      devices,
      users,
      discounts,
    };
  });

  return updatedOutlet || null;
}

async function deleteOutlet(id) {
  await updateOwnerSetupDataNow((current) => ({
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

  await updateOwnerSetupDataNow((current) => ({
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
