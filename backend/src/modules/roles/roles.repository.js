const { query } = require("../../db/pool");

async function listRoles() {
  const result = await query(
    `
      SELECT
        r.id,
        r.name,
        r.description,
        COALESCE(
          ARRAY_AGG(DISTINCT p.code) FILTER (WHERE p.code IS NOT NULL),
          ARRAY[]::text[]
        ) AS permissions
      FROM roles r
      LEFT JOIN role_permissions rp ON rp.role_id = r.id
      LEFT JOIN permissions p ON p.id = rp.permission_id
      GROUP BY r.id
      ORDER BY r.name ASC
    `
  );

  return result.rows;
}

async function listPermissions() {
  const result = await query(
    `
      SELECT
        id,
        code,
        module_name AS "moduleName",
        scope
      FROM permissions
      ORDER BY module_name ASC, code ASC
    `
  );

  return result.rows;
}

module.exports = {
  listRoles,
  listPermissions
};
