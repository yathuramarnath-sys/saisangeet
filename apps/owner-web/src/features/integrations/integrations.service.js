import { api } from "../../lib/api";
import { integrationsSeedData } from "./integrations.seed";

function normalizeService(service) {
  return {
    id: service.id,
    name: service.name,
    status: service.status || "Connected",
    meta: [
      `Purpose: ${service.category || "Platform integration"}`,
      `Sync mode: ${service.syncMode || "Automatic"}`,
      `Health: ${service.health || "Healthy"}`
    ],
    actions: ["Reconnect", "Open", "Mapping"]
  };
}

export async function fetchIntegrationsData() {
  try {
    const services = await api.get("/integrations");

    return {
      services: services.map(normalizeService),
      mapping: integrationsSeedData.mapping,
      alerts: integrationsSeedData.alerts
    };
  } catch (_error) {
    return integrationsSeedData;
  }
}
