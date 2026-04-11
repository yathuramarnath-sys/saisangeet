const { listReceiptTemplates } = require("./receipt-templates.repository");

async function fetchReceiptTemplates() {
  return listReceiptTemplates();
}

async function createReceiptTemplate(payload) {
  return {
    message: "Create receipt template implementation pending",
    payload
  };
}

module.exports = {
  fetchReceiptTemplates,
  createReceiptTemplate
};
