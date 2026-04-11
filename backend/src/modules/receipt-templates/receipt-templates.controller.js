const {
  fetchReceiptTemplates,
  createReceiptTemplate
} = require("./receipt-templates.service");

async function listReceiptTemplatesHandler(_req, res) {
  const result = await fetchReceiptTemplates();
  res.json(result);
}

async function createReceiptTemplateHandler(req, res) {
  const result = await createReceiptTemplate(req.body);
  res.status(201).json(result);
}

module.exports = {
  listReceiptTemplatesHandler,
  createReceiptTemplateHandler
};
