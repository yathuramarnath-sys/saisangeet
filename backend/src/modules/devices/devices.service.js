const { getOwnerSetupData, updateOwnerSetupData } = require("../../data/owner-setup-store");

async function fetchDevices() {
  return getOwnerSetupData().devices;
}

async function createLinkToken(payload) {
  const codeRoot = (payload.outletCode || "LINK").replace(/[^A-Z0-9]/gi, "").toUpperCase();
  return {
    linkCode: `${codeRoot}-${String(Date.now()).slice(-4)}`,
    expiresInMinutes: 15
  };
}

async function linkDevice(payload) {
  const device = {
    id: `device-${Date.now()}`,
    deviceName: payload.deviceName,
    deviceType: payload.deviceType || "POS Terminal",
    outletName: payload.outletName || "Outlet pending",
    status: "active",
    linkCode: payload.linkCode || ""
  };

  updateOwnerSetupData((current) => ({
    ...current,
    devices: [...current.devices, device]
  }));

  return device;
}

async function updateDeviceStatus(id, payload) {
  let updatedDevice = null;

  updateOwnerSetupData((current) => ({
    ...current,
    devices: current.devices.map((device) => {
      if (device.id !== id) {
        return device;
      }

      updatedDevice = {
        ...device,
        ...payload
      };
      return updatedDevice;
    })
  }));

  return updatedDevice || null;
}

module.exports = {
  fetchDevices,
  createLinkToken,
  linkDevice,
  updateDeviceStatus
};
