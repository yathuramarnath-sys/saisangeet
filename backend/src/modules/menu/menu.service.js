const { getOwnerSetupData, updateOwnerSetupData } = require("../../data/owner-setup-store");

async function fetchMenuCategories() {
  return getOwnerSetupData().menu.categories;
}

async function fetchMenuStations() {
  return getOwnerSetupData().menu.stations || [];
}

async function fetchMenuItems() {
  return getOwnerSetupData().menu.items;
}

async function createMenuStation(payload) {
  const station = {
    id: `station-${Date.now()}`,
    name: payload.name
  };

  updateOwnerSetupData((current) => ({
    ...current,
    menu: {
      ...current.menu,
      stations: [...(current.menu.stations || []), station]
    }
  }));

  return station;
}

async function createMenuCategory(payload) {
  const category = {
    id: `cat-${Date.now()}`,
    name: payload.name,
    itemCount: 0,
    station: payload.station || "Main kitchen",
    printerTarget: payload.printerTarget || "Kitchen Printer 1",
    displayTarget: payload.displayTarget || "Hot Kitchen Display"
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

async function updateMenuCategory(id, payload) {
  let updatedCategory = null;

  updateOwnerSetupData((current) => ({
    ...current,
    menu: {
      ...current.menu,
      categories: current.menu.categories.map((category) => {
        if (category.id !== id) {
          return category;
        }

        updatedCategory = {
          ...category,
          ...payload
        };
        return updatedCategory;
      }),
      items: current.menu.items.map((item) => {
        if (item.categoryId !== id) {
          return item;
        }

        return {
          ...item,
          station: payload.station || item.station
        };
      })
    }
  }));

  return updatedCategory;
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
  fetchMenuStations,
  fetchMenuItems,
  createMenuStation,
  createMenuCategory,
  createMenuItem,
  updateMenuCategory
};
