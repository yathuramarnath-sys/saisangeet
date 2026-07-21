const express = require("express");
const bcrypt  = require("bcrypt");
const { query } = require("../../db/pool");
const { warmTenantCache } = require("../../data/owner-setup-store");
const { warmUsersIndexCache } = require("../../data/users-index");

const restoreRouter = express.Router();

// Temporary one-use restore endpoint for emergency data recovery.
// Requires RESTORE_SECRET env var to be set in Railway.
// Remove this file and the route registration after use.
restoreRouter.post("/", async (req, res) => {
  const secret = process.env.RESTORE_SECRET || process.env.RESET_SECRET;
  if (!secret || req.headers["x-restore-secret"] !== secret) {
    return res.status(403).json({ error: "Forbidden" });
  }

  const { tenantId, data, ownerPassword } = req.body;
  if (!tenantId || !data) {
    return res.status(400).json({ error: "tenantId and data required" });
  }

  try {
    // Patch password hash if a new password is provided
    if (ownerPassword) {
      const hash = await bcrypt.hash(String(ownerPassword), 10);
      const users = data.users || [];
      const ownerIdx = users.findIndex(u => (u.roles || []).includes("Owner"));
      if (ownerIdx >= 0) {
        data.users[ownerIdx] = { ...data.users[ownerIdx], passwordHash: hash };
      }
    }

    // Upsert into tenant_settings
    await query(
      `INSERT INTO tenant_settings (tenant_id, key, value)
       VALUES ($1, 'owner_setup', $2)
       ON CONFLICT (tenant_id, key) DO UPDATE
         SET value = EXCLUDED.value, updated_at = NOW()`,
      [tenantId, JSON.stringify(data)]
    );

    // Register owner identifiers in users_index
    const owner = (data.users || []).find(u => (u.roles || []).includes("Owner")) || {};
    const identifiers = [owner.email, owner.phone].filter(Boolean);
    for (const id of identifiers) {
      await query(
        `INSERT INTO users_index (identifier, tenant_id)
         VALUES ($1, $2)
         ON CONFLICT (identifier) DO UPDATE SET tenant_id = EXCLUDED.tenant_id`,
        [id, tenantId]
      );
    }

    // Warm in-memory caches so the running server picks up the data immediately
    warmTenantCache(tenantId, data);
    const idx = await query("SELECT identifier, tenant_id FROM users_index");
    const map = {};
    for (const row of idx.rows) map[row.identifier] = row.tenant_id;
    warmUsersIndexCache(map);

    res.json({
      ok: true,
      tenantId,
      ownerEmail: owner.email,
      menuItems: (data.menu?.items || []).length,
      outlets: (data.outlets || []).map(o => o.name),
    });
  } catch (err) {
    console.error("[restore] Error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = { restoreRouter };
