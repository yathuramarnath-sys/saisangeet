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
  bulkImportMenuItems
} = require("./menu.service");

async function listMenuCategoriesHandler(_req, res) {
  const result = await fetchMenuCategories();
  res.json(result);
}

async function listMenuItemsHandler(_req, res) {
  const result = await fetchMenuItems();
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

async function createMenuCategoryHandler(req, res) {
  const result = await createMenuCategory(req.body);
  res.status(201).json(result);
}

async function createMenuItemHandler(req, res) {
  const result = await createMenuItem(req.body);
  res.status(201).json(result);
}

async function updateMenuCategoryHandler(req, res) {
  const result = await updateMenuCategory(req.params.id, req.body);
  res.json(result);
}

async function createMenuStationHandler(req, res) {
  const result = await createMenuStation(req.body);
  res.status(201).json(result);
}

async function updateMenuItemHandler(req, res) {
  const result = await updateMenuItem(req.params.id, req.body);
  res.json(result);
}

async function deleteMenuItemHandler(req, res) {
  const result = await deleteMenuItem(req.params.id);
  res.json(result);
}

async function deleteMenuCategoryHandler(req, res) {
  const result = await deleteMenuCategory(req.params.id);
  res.json(result);
}

async function updateMenuConfigHandler(req, res) {
  const result = await updateMenuConfig(req.body);
  res.json(result);
}

async function createMenuGroupHandler(req, res) {
  const result = await createMenuGroup(req.body);
  res.status(201).json(result);
}

async function updateMenuGroupHandler(req, res) {
  const result = await updateMenuGroup(req.params.id, req.body);
  res.json(result);
}

async function createMenuAssignmentHandler(req, res) {
  const result = await createMenuAssignment(req.body);
  res.status(201).json(result);
}

async function updateMenuAssignmentHandler(req, res) {
  const result = await updateMenuAssignment(req.params.id, req.body);
  res.json(result);
}

async function createPricingProfileHandler(req, res) {
  const result = await createPricingProfile(req.body);
  res.status(201).json(result);
}

async function updatePricingProfileHandler(req, res) {
  const result = await updatePricingProfile(req.params.id, req.body);
  res.json(result);
}

async function bulkImportMenuItemsHandler(req, res) {
  const result = await bulkImportMenuItems(req.body);
  res.status(201).json(result);
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
  bulkImportMenuItemsHandler
};
