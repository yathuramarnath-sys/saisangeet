const {
  fetchDevices,
  createLinkToken,
  linkDevice,
  updateDeviceStatus,
  resolveLinkCode,
  fetchStaffForDevice,
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

// Validates that linkCode is present, not too long, and only contains
// alphanumeric characters and dashes — prevents injection and garbage input.
const LINK_CODE_RE = /^[A-Z0-9-]{1,30}$/i;

async function resolveLinkCodeHandler(req, res) {
  try {
    const { linkCode, deviceType } = req.body;

    if (!linkCode || typeof linkCode !== "string") {
      return res.status(400).json({ error: { code: "INVALID_INPUT", message: "linkCode is required." } });
    }
    if (!LINK_CODE_RE.test(linkCode.trim())) {
      return res.status(400).json({ error: { code: "INVALID_INPUT", message: "Invalid link code format." } });
    }
    if (deviceType && typeof deviceType !== "string") {
      return res.status(400).json({ error: { code: "INVALID_INPUT", message: "Invalid deviceType." } });
    }

    const result = await resolveLinkCode({ linkCode: linkCode.trim().toUpperCase(), deviceType });
    res.json(result);
  } catch (err) {
    res.status(err.status || 400).json({ error: { code: "RESOLVE_FAILED", message: err.message } });
  }
}

async function fetchStaffHandler(req, res) {
  try {
    const outletId = req.user?.outletId;
    if (!outletId) return res.status(400).json({ error: { message: "Device token missing outletId." } });
    const result = await fetchStaffForDevice(outletId);
    res.json(result);
  } catch (err) {
    res.status(err.status || 500).json({ error: { message: err.message } });
  }
}

module.exports = {
  listDevicesHandler,
  createLinkTokenHandler,
  linkDeviceHandler,
  updateDeviceStatusHandler,
  resolveLinkCodeHandler,
  fetchStaffHandler,
};
