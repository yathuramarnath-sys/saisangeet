const { query } = require("../../db/pool");
const { getOwnerSetupData } = require("../../data/owner-setup-store");

// ─── Fallback: look up a user from the file-based owner-setup-store ───────────
// Used when Postgres is not available (local dev / preview).

function findUserInStore(identifier) {
  const data = getOwnerSetupData();
  const id = identifier.toLowerCase().trim();

  const match = (data.users || []).find((u) => {
    return (
      (u.email  && u.email.toLowerCase()  === id) ||
      (u.phone  && u.phone.replace(/\s/g, "") === id) ||
      (u.name   && u.name.toLowerCase()   === id)
    );
  });

  if (!match) return null;

  // Build a full permissions list from all roles in the setup store
  const allPerms = [];
  (data.permissions || []).forEach((p) => allPerms.push(p.code));

  return {
    id:           match.id,
    outletId:     null,
    fullName:     match.fullName || match.name,
    email:        match.email || identifier,
    phone:        match.phone || null,
    passwordHash: match.passwordHash || null,
    status:       match.isActive !== false ? "active" : "inactive",
    roles:        match.roles || [],
    permissions:  (match.roles || []).includes("Owner") ? allPerms : [],
  };
}

async function findUserByIdentifier(identifier) {
  // ── 1. Try Postgres ────────────────────────────────────────────────────────
  try {
    const result = await query(
      `
        SELECT
          u.id,
          u.outlet_id AS "outletId",
          u.full_name AS "fullName",
          u.email,
          u.phone,
          u.password_hash AS "passwordHash",
          u.status,
          COALESCE(
            ARRAY_AGG(DISTINCT r.name) FILTER (WHERE r.name IS NOT NULL),
            ARRAY[]::text[]
          ) AS roles,
          COALESCE(
            ARRAY_AGG(DISTINCT p.code) FILTER (WHERE p.code IS NOT NULL),
            ARRAY[]::text[]
          ) AS permissions
        FROM users u
        LEFT JOIN user_roles ur ON ur.user_id = u.id
        LEFT JOIN roles r ON r.id = ur.role_id
        LEFT JOIN role_permissions rp ON rp.role_id = r.id
        LEFT JOIN permissions p ON p.id = rp.permission_id
        WHERE u.email = $1 OR u.phone = $1
        GROUP BY u.id
        LIMIT 1
      `,
      [identifier]
    );
    if (result.rows[0]) return result.rows[0];
  } catch (_dbErr) {
    // Postgres unavailable — fall through to file-based fallback
  }

  // ── 2. Fall back to owner-setup-store (local dev) ──────────────────────────
  return findUserInStore(identifier);
}

module.exports = {
  findUserByIdentifier
};
