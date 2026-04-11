const { listDevices } = require("./devices.repository");

async function fetchDevices() {
  return listDevices();
}

async function createLinkToken(payload) {
  return {
    message: "Create device link token implementation pending",
    payload
  };
}

async function linkDevice(payload) {
  return {
    message: "Link device implementation pending",
    payload
  };
}

async function updateDeviceStatus(id, payload) {
  return {
    message: "Update device status implementation pending",
    deviceId: id,
    payload
  };
}

module.exports = {
  fetchDevices,
  createLinkToken,
  linkDevice,
  updateDeviceStatus
};
