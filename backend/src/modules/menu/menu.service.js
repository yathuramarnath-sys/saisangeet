const { getOwnerSetupData, updateOwnerSetupData } = require("../../data/owner-setup-store");

async function fetchMenuCategories() {
  return getOwnerSetupData().menu.categories;
}

async function fetchMenuItems() {
  return getOwnerSetupData().menu.items;
}

async function createMenuCategory(payload) {
  const category = {
    id: `cat-${Date.now()}`,
    name: payload.name,
    itemCount: 0
  };

  updateOwnerSetupData((current) => ({
    ...current,
    menu: {
      ...current.menu,
      categories: [...current.menu.categories, category]
    }
  }));

  return category;
}

async function createMenuItem(payload) {
  const item = {
    id: `item-${Date.now()}`,
    categoryId: payload.categoryId,
    name: payload.name,
    station: payload.station || "Main kitchen",
    gstLabel: payload.gstLabel || "GST 5%",
    status: payload.status || "Live",
    foodType: payload.foodType || "Veg",
    badges: payload.badges || ["Custom item", "Available"],
    salesAvailability: payload.salesAvailability || "Available",
    outletAvailability: payload.outletAvailability || [],
    inventoryTracking: payload.inventoryTracking || {
      enabled: false,
      mode: "Optional later",
      note: "Inventory tracking is disabled for this item"
    },
    pricing: payload.pricing || []
  };

  updateOwnerSetupData((current) => ({
    ...current,
    menu: {
      ...current.menu,
      categories: current.menu.categories.map((category) =>
        category.id === item.categoryId
          ? { ...category, itemCount: Number(category.itemCount || 0) + 1 }
          : category
      ),
      items: [item, ...current.menu.items]
    }
  }));

  return item;
}

module.exports = {
  fetchMenuCategories,
  fetchMenuItems,
  createMenuCategory,
  createMenuItem
};
