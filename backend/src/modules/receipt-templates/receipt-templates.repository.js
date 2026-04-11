const { query } = require("../../db/pool");

async function listReceiptTemplates() {
  const result = await query(
    `
      SELECT
        id,
        outlet_id AS "outletId",
        name,
        template_type AS "templateType",
        header_text AS "headerText",
        footer_text AS "footerText",
        show_logo AS "showLogo",
        show_qr_payment AS "showQrPayment",
        show_tax_breakdown AS "showTaxBreakdown",
        show_customer_details AS "showCustomerDetails",
        is_default AS "isDefault"
      FROM receipt_templates
      ORDER BY name ASC
    `
  );

  return result.rows;
}

module.exports = {
  listReceiptTemplates
};
