const { getOwnerSetupData, updateOwnerSetupData, updateOwnerSetupDataNow } = require("../../data/owner-setup-store");
const { getCurrentTenantId, runWithTenant } = require("../../data/tenant-context");

async function fetchDevices() {
  return getOwnerSetupData().devices;
}

async function createLinkToken(payload) {
  // Keep the outlet code exactly as stored (e.g. "MUM-1001") so the generated
  // link code is readable and consistent: "MUM-1001-5678"
  const codeRoot  = (payload.outletCode || "LINK").trim().toUpperCase();
  const suffix    = String(Date.now()).slice(-4);
  const linkCode  = `${codeRoot}-${suffix}`;
  const tenantId  = getCurrentTenantId();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

  // ── Primary: write directly to the pending_link_tokens Postgres table ──────
  // This survives server restarts — no dependency on in-memory cache.
  let savedToDb = false;
  try {
    const { query } = require("../../db/pool");
    await query(
      `INSERT INTO pending_link_tokens (link_code, outlet_code, outlet_id, tenant_id, expires_at)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (link_code) DO UPDATE
         SET outlet_code = EXCLUDED.outlet_code,
             outlet_id   = EXCLUDED.outlet_id,
             expires_at  = EXCLUDED.expires_at`,
      [linkCode, payload.outletCode || "", payload.outletId || "", tenantId, expiresAt]
    );
    savedToDb = true;
  } catch (dbErr) {
    console.warn("[devices] Postgres token insert failed, using cache fallback:", dbErr.message);
  }

  // ── Fallback: also store in owner_setup JSON (works if Postgres is down) ───
  if (!savedToDb) {
    const expiresAtMs = expiresAt.getTime();
    updateOwnerSetupData((data) => {
      const live = (data.pendingLinkTokens || []).filter((t) => t.expiresAt > Date.now());
      live.push({ linkCode, outletCode: payload.outletCode || "", outletId: payload.outletId || "", expiresAt: expiresAtMs });
      return { ...data, pendingLinkTokens: live };
    });
  }

  return { linkCode, expiresInHours: 24 };
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

  let data = getOwnerSetupData();

  // ── 1. Find device with this exact linkCode (case-insensitive) ──────────
  const device = (data.devices || []).find(
    (d) => d.linkCode && d.linkCode.toLowerCase() === raw.toLowerCase()
  );

  let outlet = null;

  if (device) {
    outlet = (data.outlets || []).find((o) => o.name === device.outletName);
  }

  // ── 2a. Check Postgres pending_link_tokens table directly (most reliable) ───
  // Reads tenant_id from the token row, then loads that tenant's data DIRECTLY
  // from Postgres — bypasses in-memory cache so Railway restarts can't break this.
  if (!outlet) {
    try {
      const { query } = require("../../db/pool");

      // Step 1: find the token
      const tokenResult = await query(
        `SELECT outlet_id, outlet_code, tenant_id FROM pending_link_tokens
         WHERE LOWER(link_code) = LOWER($1) AND expires_at > NOW()`,
        [raw]
      );

      if (tokenResult.rows[0]) {
        const row           = tokenResult.rows[0];
        const tokenTenantId = row.tenant_id || getCurrentTenantId();

        // Step 2: load that tenant's full setup DIRECTLY from Postgres
        const { warmTenantCache } = require("../../data/owner-setup-store");
        const setupResult = await query(
          `SELECT value FROM tenant_settings WHERE tenant_id = $1 AND key = 'owner_setup'`,
          [tokenTenantId]
        );

        let tenantOutlets = [];
        if (setupResult.rows[0]) {
          const raw_setup = setupResult.rows[0].value;
          // Refresh the in-memory cache while we're at it
          warmTenantCache(tokenTenantId, raw_setup);
          tenantOutlets = (raw_setup.outlets || []);
          // Use this tenant's full data for the rest of the function
          data = await new Promise((resolve) =>
            runWithTenant(tokenTenantId, () => resolve(getOwnerSetupData()))
          );
        }

        // Step 3: find the outlet
        if (row.outlet_id) {
          outlet = tenantOutlets.find((o) => o.id === row.outlet_id);
        }
        if (!outlet && row.outlet_code) {
          const stored = row.outlet_code.toUpperCase();
          outlet = tenantOutlets.find(
            (o) =>
              (o.code || "").toUpperCase() === stored ||
              (o.code || "").toUpperCase().replace(/[^A-Z0-9]/g, "") === stored.replace(/[^A-Z0-9]/g, "")
          );
        }
      }
    } catch (_dbErr) {
      // Postgres unavailable — fall through to in-memory cache check
    }
  }

  // ── 2b. Check in-memory pendingLinkTokens (fallback when Postgres is down) ─
  if (!outlet) {
    const token = (data.pendingLinkTokens || []).find(
      (t) => t.linkCode && t.linkCode.toLowerCase() === raw.toLowerCase() && t.expiresAt > Date.now()
    );
    if (token) {
      if (token.outletId) {
        outlet = (data.outlets || []).find((o) => o.id === token.outletId);
      }
      if (!outlet && token.outletCode) {
        const stored = (token.outletCode || "").toUpperCase();
        outlet = (data.outlets || []).find(
          (o) =>
            (o.code || "").toUpperCase() === stored ||
            (o.code || "").toUpperCase().replace(/[^A-Z0-9]/g, "") === stored.replace(/[^A-Z0-9]/g, "")
        );
      }
    }
  }

  // ── 3. Fallback: parse outlet code from prefix
  //    Handles "MUM-1001-5678" → prefix "MUM-1001"
  //    Also handles legacy stripped codes like "MUM1001-5678" → prefix "MUM1001"
  if (!outlet) {
    const parts          = raw.toUpperCase().split("-");
    const prefix         = parts.length >= 2 ? parts.slice(0, -1).join("-") : parts[0];
    const prefixStripped = prefix.replace(/[^A-Z0-9]/g, "");
    outlet = (data.outlets || []).find((o) => {
      const code         = (o.code || "").toUpperCase();
      const codeStripped = code.replace(/[^A-Z0-9]/g, "");
      return (
        code === prefix ||
        codeStripped === prefixStripped
      );
    });
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
  // Delete from Postgres table
  try {
    const { query } = require("../../db/pool");
    await query("DELETE FROM pending_link_tokens WHERE LOWER(link_code) = LOWER($1)", [raw]);
  } catch (_) {}
  // Also remove from in-memory cache fallback
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
