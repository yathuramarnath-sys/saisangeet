const {
  fetchMenuCategories,
  fetchMenuItems,
  fetchMenuStations,
  fetchMenuConfig,
  fetchMenuGroups,
  fetchMenuAssignments,
  fetchPricingProfiles,
  createMenuCategory,
  createMenuItem,
  updateMenuCategory,
  createMenuStation,
  updateMenuItem,
  deleteMenuItem,
  deleteMenuCategory,
  updateMenuConfig,
  createMenuGroup,
  updateMenuGroup,
  createMenuAssignment,
  updateMenuAssignment,
  createPricingProfile,
  updatePricingProfile,
  bulkImportMenuItems,
  lookupItemBySku,
} = require("./menu.service");

async function listMenuCategoriesHandler(req, res) {
  const result = await fetchMenuCategories(req.query.outletId);
  res.json(result);
}

async function listMenuItemsHandler(req, res) {
  const result = await fetchMenuItems(req.query.outletId);
  res.json(result);
}

async function listMenuStationsHandler(_req, res) {
  const result = await fetchMenuStations();
  res.json(result);
}

async function listMenuConfigHandler(_req, res) {
  const result = await fetchMenuConfig();
  res.json(result);
}

async function listMenuGroupsHandler(_req, res) {
  const result = await fetchMenuGroups();
  res.json(result);
}

async function listMenuAssignmentsHandler(_req, res) {
  const result = await fetchMenuAssignments();
  res.json(result);
}

async function listPricingProfilesHandler(_req, res) {
  const result = await fetchPricingProfiles();
  res.json(result);
}

function pushSync(req, type = "menu") {
  const io       = req.app.locals.io;
  const tenantId = req.user?.tenantId || "default";
  // Scope to tenant room — prevents menu-change events leaking to other tenants
  if (io) io.to(`tenant:${tenantId}`).emit("sync:config", { type, ts: Date.now() });
}

async function createMenuCategoryHandler(req, res) {
  const result = await createMenuCategory(req.body);
  pushSync(req);
  res.status(201).json(result);
}

async function createMenuItemHandler(req, res) {
  const result = await createMenuItem(req.body);
  pushSync(req);
  res.status(201).json(result);
}

async function updateMenuCategoryHandler(req, res) {
  const result = await updateMenuCategory(req.params.id, req.body);
  pushSync(req);
  res.json(result);
}

async function createMenuStationHandler(req, res) {
  const result = await createMenuStation(req.body);
  pushSync(req, "stations");
  res.status(201).json(result);
}

async function updateMenuItemHandler(req, res) {
  const result = await updateMenuItem(req.params.id, req.body);
  pushSync(req);
  res.json(result);
}

async function deleteMenuItemHandler(req, res) {
  const result = await deleteMenuItem(req.params.id);
  pushSync(req);
  res.json(result);
}

async function deleteMenuCategoryHandler(req, res) {
  const result = await deleteMenuCategory(req.params.id);
  pushSync(req);
  res.json(result);
}

async function updateMenuConfigHandler(req, res) {
  const result = await updateMenuConfig(req.body);
  pushSync(req);
  res.json(result);
}

async function createMenuGroupHandler(req, res) {
  const result = await createMenuGroup(req.body);
  pushSync(req);
  res.status(201).json(result);
}

async function updateMenuGroupHandler(req, res) {
  const result = await updateMenuGroup(req.params.id, req.body);
  pushSync(req);
  res.json(result);
}

async function createMenuAssignmentHandler(req, res) {
  const result = await createMenuAssignment(req.body);
  pushSync(req);
  res.status(201).json(result);
}

async function updateMenuAssignmentHandler(req, res) {
  const result = await updateMenuAssignment(req.params.id, req.body);
  pushSync(req);
  res.json(result);
}

async function createPricingProfileHandler(req, res) {
  const result = await createPricingProfile(req.body);
  pushSync(req);
  res.status(201).json(result);
}

async function updatePricingProfileHandler(req, res) {
  const result = await updatePricingProfile(req.params.id, req.body);
  pushSync(req);
  res.json(result);
}

async function bulkImportMenuItemsHandler(req, res) {
  const result = await bulkImportMenuItems(req.body);
  pushSync(req);
  res.status(201).json(result);
}

// GET /menu/sku-lookup?sku=xxx  — used by POS barcode scanner
async function skuLookupHandler(req, res) {
  const sku = req.query.sku || "";
  if (!sku.trim()) {
    return res.status(400).json({ error: { message: "sku query param required" } });
  }
  const item = await lookupItemBySku(sku);
  if (!item) {
    return res.status(404).json({ error: { code: "SKU_NOT_FOUND", message: "No item found for this barcode." } });
  }
  res.json(item);
}

// POST /menu/auto-number
// Assigns sequential SKU numbers (1, 2, 3...) to all items that don't have one.
// Safe to call multiple times — only fills in missing SKUs, never overwrites existing ones.
async function autoNumberItemsHandler(req, res) {
  const { getOwnerSetupData, updateOwnerSetupData } = require("../../data/owner-setup-store");
  const data = getOwnerSetupData();
  const items = data.menu?.items || [];

  // Find highest existing numeric SKU
  const maxNum = items.reduce((max, i) => {
    const n = parseInt(i.sku, 10);
    return !isNaN(n) && n > max ? n : max;
  }, 0);

  let counter = maxNum;
  let assigned = 0;

  updateOwnerSetupData((current) => {
    const updated = (current.menu?.items || []).map((item) => {
      if (item.sku && item.sku.trim()) return item; // already has SKU — skip
      counter++;
      assigned++;
      return { ...item, sku: String(counter) };
    });
    return { ...current, menu: { ...current.menu, items: updated } };
  });

  res.json({ ok: true, assigned, message: `${assigned} items numbered starting from ${maxNum + 1}` });
}

module.exports = {
  listMenuCategoriesHandler,
  listMenuItemsHandler,
  listMenuStationsHandler,
  listMenuConfigHandler,
  listMenuGroupsHandler,
  listMenuAssignmentsHandler,
  listPricingProfilesHandler,
  createMenuCategoryHandler,
  createMenuItemHandler,
  updateMenuCategoryHandler,
  createMenuStationHandler,
  updateMenuItemHandler,
  deleteMenuItemHandler,
  deleteMenuCategoryHandler,
  updateMenuConfigHandler,
  createMenuGroupHandler,
  updateMenuGroupHandler,
  createMenuAssignmentHandler,
  updateMenuAssignmentHandler,
  createPricingProfileHandler,
  updatePricingProfileHandler,
  bulkImportMenuItemsHandler,
  skuLookupHandler,
  autoNumberItemsHandler,
};
