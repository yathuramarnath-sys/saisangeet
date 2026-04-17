import { api } from "../../lib/api";
import { outletSeedData } from "./outlets.seed";

function normalizeOutlet(outlet, appConfig) {
  const linkedDevices = (appConfig.devices || []).filter((device) => device.outletName === outlet.name);
  const defaultTax = (appConfig.taxProfiles || []).find((profile) => profile.id === outlet.defaultTaxProfileId);
  const receiptTemplate = (appConfig.receiptTemplates || []).find((template) => template.id === outlet.receiptTemplateId);
  const workAreas = outlet.workAreas || [];
  const tables = outlet.tables || [];
  const hours = outlet.hours || "Business hours pending";
  const services = outlet.services || ["Dine-in", "Takeaway"];
  const reportEmail = outlet.reportEmail || "";
  const needsReview = !outlet.defaultTaxProfileId || !outlet.receiptTemplateId || !reportEmail;

  return {
    id: outlet.id,
    code: outlet.code,
    name: outlet.name,
    city: outlet.city || "Unknown",
    state: outlet.state || "Unknown",
    gstin: outlet.gstin || "",
    isActive: outlet.isActive ?? true,
    hours,
    services,
    workAreas,
    tables,
    tableCount: tables.length,
    reportEmail,
    devicesLinked: linkedDevices.length,
    deviceNames: linkedDevices.map((device) => device.deviceName || device.name),
    defaultTax: defaultTax?.name || "Default tax pending",
    defaultTaxProfileId: outlet.defaultTaxProfileId || "",
    receiptTemplateId: outlet.receiptTemplateId || "",
    receiptTemplateName: receiptTemplate?.name || "Receipt pending",
    status: outlet.isActive ? (needsReview ? "Review" : "Healthy") : "Inactive"
  };
}

export async function fetchOutletPageData() {
  try {
    const [outlets, appConfig] = await Promise.all([api.get("/outlets"), api.get("/setup/app-config")]);

    return {
      outlets: outlets.map((outlet) => normalizeOutlet(outlet, appConfig)),
      taxProfiles: appConfig.taxProfiles || [],
      receiptTemplates: appConfig.receiptTemplates || [],
      devices: appConfig.devices || []
    };
  } catch (_error) {
    const emptyConfig = { devices: [], taxProfiles: [], receiptTemplates: [] };
    return {
      outlets: outletSeedData.map((outlet) => normalizeOutlet(outlet, emptyConfig)),
      taxProfiles: [],
      receiptTemplates: [],
      devices: []
    };
  }
}

export async function createOutlet(payload) {
  return api.post("/outlets", payload);
}

export async function updateOutlet(id, payload) {
  return api.patch(`/outlets/${id}/settings`, payload);
}

export async function createOutletLinkCode(payload) {
  return api.post("/devices/link-token", payload);
}

export async function linkOutletDevice(payload) {
  return api.post("/devices/link", payload);
}
