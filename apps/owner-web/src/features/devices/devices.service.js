import { api } from "../../lib/api";
import { devicesSeedData } from "./devices.seed";

function normalizeDevice(device) {
  return {
    id: device.id,
    name: device.deviceName || device.name,
    type: device.deviceType || device.type || "Device",
    outlet: device.outletName || device.outlet || "Outlet pending",
    setup: device.status === "active" ? "Setup synced" : "Setup review pending",
    status: device.status === "active" ? "Active" : "Review"
  };
}

export async function fetchDevicesData() {
  try {
    const devices = await api.get("/devices");

    return {
      linkCode: devicesSeedData.linkCode,
      devices: devices.map(normalizeDevice),
      alerts: devicesSeedData.alerts
    };
  } catch (_error) {
    return devicesSeedData;
  }
}

export async function createDeviceLinkCode(payload) {
  return api.post("/devices/link-token", payload);
}

export async function linkDevice(payload) {
  return api.post("/devices/link", payload);
}
