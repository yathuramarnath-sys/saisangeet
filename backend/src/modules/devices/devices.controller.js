const {
  fetchDevices,
  createLinkToken,
  linkDevice,
  updateDeviceStatus,
  resolveLinkCode,
} = require("./devices.service");

async function listDevicesHandler(_req, res) {
  const result = await fetchDevices();
  res.json(result);
}

async function createLinkTokenHandler(req, res) {
  const result = await createLinkToken(req.body);
  res.status(201).json(result);
}

async function linkDeviceHandler(req, res) {
  const result = await linkDevice(req.body);
  res.json(result);
}

async function updateDeviceStatusHandler(req, res) {
  const result = await updateDeviceStatus(req.params.id, req.body);
  res.json(result);
}

async function resolveLinkCodeHandler(req, res) {
  try {
    const result = await resolveLinkCode(req.body);
    res.json(result);
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message });
  }
}

module.exports = {
  listDevicesHandler,
  createLinkTokenHandler,
  linkDeviceHandler,
  updateDeviceStatusHandler,
  resolveLinkCodeHandler,
};
