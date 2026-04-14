const {
  fetchMenuCategories,
  fetchMenuItems,
  createMenuCategory,
  createMenuItem
} = require("./menu.service");

async function listMenuCategoriesHandler(_req, res) {
  const result = await fetchMenuCategories();
  res.json(result);
}

async function listMenuItemsHandler(_req, res) {
  const result = await fetchMenuItems();
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

module.exports = {
  listMenuCategoriesHandler,
  listMenuItemsHandler,
  createMenuCategoryHandler,
  createMenuItemHandler
};
