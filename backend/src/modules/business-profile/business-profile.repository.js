const { query } = require("../../db/pool");

async function getBusinessProfile() {
  const result = await query(
    `
      SELECT
        id,
        legal_name AS "legalName",
        trade_name AS "tradeName",
        gstin,
        phone,
        email,
        address_line_1 AS "addressLine1",
        address_line_2 AS "addressLine2",
        city,
        state,
        postal_code AS "postalCode",
        country,
        timezone,
        currency_code AS "currencyCode",
        logo_url AS "logoUrl",
        invoice_header AS "invoiceHeader",
        invoice_footer AS "invoiceFooter"
      FROM business_profiles
      ORDER BY created_at ASC
      LIMIT 1
    `
  );

  return result.rows[0] || null;
}

module.exports = {
  getBusinessProfile
};
