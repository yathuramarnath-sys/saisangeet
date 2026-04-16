import { api } from "../../lib/api";

export async function fetchIntegrationsData() {
  return api.get("/integrations");
}

export async function updateZohoBooksSettings(payload) {
  return api.patch("/integrations/zoho-books", payload);
}

export async function updateZohoAccountMapping(payload) {
  return api.patch("/integrations/account-mapping", payload);
}

export async function createVendorMapping(payload) {
  return api.post("/integrations/vendors", payload);
}

export async function updateVendorMapping(vendorId, payload) {
  return api.patch(`/integrations/vendors/${vendorId}`, payload);
}

export async function deleteVendorMapping(vendorId) {
  return api.delete(`/integrations/vendors/${vendorId}`);
}

export async function createPurchaseEntry(payload) {
  return api.post("/integrations/purchase-entries", payload);
}

export async function runZohoSync() {
  return api.post("/integrations/zoho-books/run-sync", {});
}
