const { query } = require("../../db/pool");

async function listOutlets() {
  const result = await query(
    `
      SELECT
        id,
        code,
        name,
        gstin,
        city,
        state,
        is_active AS "isActive"
      FROM outlets
      ORDER BY name ASC
    `
  );

  return result.rows;
}

module.exports = {
  listOutlets
};
