const {
  fetchMenuCategories,
  fetchMenuItems,
  fetchMenuStations,
  createMenuCategory,
  createMenuItem,
  updateMenuCategory,
  createMenuStation
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

module.exports = {
  listMenuCategoriesHandler,
  listMenuItemsHandler,
  listMenuStationsHandler,
  createMenuCategoryHandler,
  createMenuItemHandler,
  updateMenuCategoryHandler,
  createMenuStationHandler
};
