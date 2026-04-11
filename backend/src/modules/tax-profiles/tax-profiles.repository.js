const { query } = require("../../db/pool");

async function listTaxProfiles() {
  const result = await query(
    `
      SELECT
        id,
        name,
        cgst_rate AS "cgstRate",
        sgst_rate AS "sgstRate",
        igst_rate AS "igstRate",
        cess_rate AS "cessRate",
        is_inclusive AS "isInclusive",
        is_default AS "isDefault"
      FROM business_tax_profiles
      ORDER BY name ASC
    `
  );

  return result.rows;
}

module.exports = {
  listTaxProfiles
};
