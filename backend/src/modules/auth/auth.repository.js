const { query } = require("../../db/pool");

async function findUserByIdentifier(identifier) {
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

  return result.rows[0] || null;
}

module.exports = {
  findUserByIdentifier
};
