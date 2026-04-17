import { api } from "../../lib/api";
import { taxesSeedData } from "./taxes.seed";

function normalizeProfile(profile, index) {
  return {
    id: profile.id,
    name: profile.name,
    summary: `CGST ${profile.cgstRate}% + SGST ${profile.sgstRate}%${profile.isDefault ? " • Default profile" : ""}`,
    active: index === 0 || Boolean(profile.isDefault)
  };
}

export async function fetchTaxesData() {
  try {
    const [profiles, receiptTemplates] = await Promise.all([
      api.get("/settings/tax-profiles"),
      api.get("/settings/receipt-templates")
    ]);

    return {
      profiles: profiles.map(normalizeProfile),
      receiptTemplates,
      outletDefaults: taxesSeedData.outletDefaults,
      alerts: taxesSeedData.alerts
    };
  } catch (_error) {
    return {
      ...taxesSeedData,
      receiptTemplates: [
        { id: "dine-standard", name: "Dine-In Standard", showQrPayment: true, showTaxBreakdown: true }
      ]
    };
  }
}

export async function createTaxProfile(payload) {
  return api.post("/settings/tax-profiles", payload);
}

export async function createReceiptTemplate(payload) {
  return api.post("/settings/receipt-templates", payload);
}
