const {
  fetchIntegrations,
  updateZohoBooks,
  updateAccountMapping,
  createVendorMapping,
  updateVendorMapping,
  deleteVendorMapping,
  createPurchaseEntry,
  runZohoSync
} = require("./integrations.service");

async function listIntegrationsHandler(_req, res) {
  const result = await fetchIntegrations();
  res.json(result);
}

async function updateZohoBooksHandler(req, res) {
  const result = await updateZohoBooks(req.body);
  res.json(result);
}

async function updateAccountMappingHandler(req, res) {
  const result = await updateAccountMapping(req.body);
  res.json(result);
}

async function createVendorMappingHandler(req, res) {
  const result = await createVendorMapping(req.body);
  res.status(201).json(result);
}

async function updateVendorMappingHandler(req, res) {
  const result = await updateVendorMapping(req.params.vendorId, req.body);
  res.json(result);
}

async function deleteVendorMappingHandler(req, res) {
  const result = await deleteVendorMapping(req.params.vendorId);
  res.json(result || { success: true });
}

async function createPurchaseEntryHandler(req, res) {
  const result = await createPurchaseEntry(req.body);
  res.status(201).json(result);
}

async function runZohoSyncHandler(_req, res) {
  const result = await runZohoSync();
  res.json(result);
}

module.exports = {
  listIntegrationsHandler,
  updateZohoBooksHandler,
  updateAccountMappingHandler,
  createVendorMappingHandler,
  updateVendorMappingHandler,
  deleteVendorMappingHandler,
  createPurchaseEntryHandler,
  runZohoSyncHandler
};
