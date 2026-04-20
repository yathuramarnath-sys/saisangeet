const { getOwnerSetupData, updateOwnerSetupData } = require("../../data/owner-setup-store");

async function fetchDevices() {
  return getOwnerSetupData().devices;
}

async function createLinkToken(payload) {
  const codeRoot = (payload.outletCode || "LINK").replace(/[^A-Z0-9]/gi, "").toUpperCase();
  const linkCode = `${codeRoot}-${String(Date.now()).slice(-4)}`;

  // Store the token so resolveLinkCode can find which outlet it belongs to.
  // We keep it for 24 hours; it's cleared once the device connects.
  const expiresAt = Date.now() + 24 * 60 * 60 * 1000;
  updateOwnerSetupData((data) => {
    // Prune expired tokens first to keep the list tidy
    const live = (data.pendingLinkTokens || []).filter((t) => t.expiresAt > Date.now());
    live.push({ linkCode, outletCode: payload.outletCode || "", expiresAt });
    return { ...data, pendingLinkTokens: live };
  });

  return { linkCode, expiresInMinutes: 15 };
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

/**
 * resolveLinkCode — public endpoint, no auth required.
 * Takes a link code like "INDR-1001" and returns the matching outlet config
 * plus the staff list for that outlet (for Captain App login grid).
 */
async function resolveLinkCode(payload) {
  const raw = (payload.linkCode || "").trim();
  if (!raw) throw Object.assign(new Error("Link code is required."), { status: 400 });

  const data = getOwnerSetupData();

  // ── 1. Find device with this exact linkCode (case-insensitive) ──────────
  const device = (data.devices || []).find(
    (d) => d.linkCode && d.linkCode.toLowerCase() === raw.toLowerCase()
  );

  let outlet = null;

  if (device) {
    outlet = (data.outlets || []).find((o) => o.name === device.outletName);
  }

  // ── 2. Check pendingLinkTokens — the stored token always has the exact outletCode ──
  if (!outlet) {
    const token = (data.pendingLinkTokens || []).find(
      (t) => t.linkCode && t.linkCode.toLowerCase() === raw.toLowerCase() && t.expiresAt > Date.now()
    );
    if (token) {
      const stored = (token.outletCode || "").toUpperCase();
      outlet = (data.outlets || []).find(
        (o) =>
          (o.code || "").toUpperCase() === stored ||
          // Also try stripped form in case outletCode was stored with hyphens
          (o.code || "").toUpperCase().replace(/[^A-Z0-9]/g, "") === stored.replace(/[^A-Z0-9]/g, "")
      );
    }
  }

  // ── 3. Fallback: parse outlet code from prefix (handles both "INDR-1001" and "INDR001-1234")
  if (!outlet) {
    const parts   = raw.toUpperCase().split("-");
    const prefix  = parts.length >= 2 ? parts.slice(0, -1).join("-") : parts[0];
    const prefixStripped = prefix.replace(/[^A-Z0-9]/g, "");
    outlet = (data.outlets || []).find(
      (o) => {
        const code        = (o.code || "").toUpperCase();
        const codeStripped = code.replace(/[^A-Z0-9]/g, "");
        const name        = (o.name || "").toUpperCase().replace(/\s+/g, "");
        return code === prefix ||
               codeStripped === prefix ||
               codeStripped === prefixStripped ||
               name.startsWith(prefix) ||
               name.startsWith(prefixStripped);
      }
    );
  }

  if (!outlet) {
    throw Object.assign(
      new Error("Invalid link code — please check with your manager."),
      { status: 404 }
    );
  }

  // ── 3. Build staff list for this outlet ──────────────────────────────────
  const OPS_ROLES = ["Captain", "Waiter", "Cashier", "Manager", "Kitchen"];
  const staff = (data.users || [])
    .filter(
      (u) =>
        u.isActive !== false &&
        Array.isArray(u.roles) &&
        u.roles.some((r) => OPS_ROLES.includes(r)) &&
        (u.outletName === "All Outlets" || u.outletName === outlet.name)
    )
    .map((u) => ({
      id:     u.id,
      name:   u.fullName || u.name,
      role:   u.roles?.[0] || "Staff",
      pin:    u.pin || "0000",
      avatar: (u.fullName || u.name || "?")[0].toUpperCase(),
    }));

  // ── 5. Consume the pending token so the same code can't be reused ─────────
  updateOwnerSetupData((d) => ({
    ...d,
    pendingLinkTokens: (d.pendingLinkTokens || []).filter(
      (t) => t.linkCode.toLowerCase() !== raw.toLowerCase()
    )
  }));

  // Include kitchen stations so POS can populate the printer-setup dropdown immediately
  const kitchenStations = (data.menu?.stations || []).map((s) => ({
    id:         s.id,
    name:       s.name,
    outletId:   s.outletId || "all",
    categories: s.categories || []
  }));

  return {
    outletId:        outlet.id,
    outletCode:      outlet.code,
    outletName:      outlet.name,
    workAreas:       outlet.workAreas || [],
    tables:          outlet.tables    || [],
    staff,
    kitchenStations,
  };
}

module.exports = {
  fetchDevices,
  createLinkToken,
  linkDevice,
  updateDeviceStatus,
  resolveLinkCode,
};
