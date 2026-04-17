const { getOwnerSetupData, updateOwnerSetupData } = require("../../data/owner-setup-store");

async function fetchReceiptTemplates() {
  return getOwnerSetupData().receiptTemplates;
}

async function createReceiptTemplate(payload) {
  const template = {
    id: `receipt-${Date.now()}`,
    name: payload.name,
    showQrPayment: payload.showQrPayment !== false,
    showTaxBreakdown: payload.showTaxBreakdown !== false,
    footerNote: payload.footerNote || "",
    outletName: payload.outletName || "All Outlets"
  };

  updateOwnerSetupData((current) => ({
    ...current,
    receiptTemplates: [...current.receiptTemplates, template]
  }));

  return template;
}

module.exports = {
  fetchReceiptTemplates,
  createReceiptTemplate
};
