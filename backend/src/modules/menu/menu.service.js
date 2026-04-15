const { getOwnerSetupData, updateOwnerSetupData } = require("../../data/owner-setup-store");

function slugify(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function fetchMenuCategories() {
  return getOwnerSetupData().menu.categories;
}

async function fetchMenuStations() {
  return getOwnerSetupData().menu.stations || [];
}

async function fetchMenuItems() {
  return getOwnerSetupData().menu.items;
}

async function fetchMenuConfig() {
  return getOwnerSetupData().menu.config || {};
}

async function fetchMenuGroups() {
  return getOwnerSetupData().menu.menuGroups || [];
}

async function fetchMenuAssignments() {
  return getOwnerSetupData().menu.menuAssignments || [];
}

async function fetchPricingProfiles() {
  return getOwnerSetupData().menu.pricingProfiles || [];
}

async function createMenuStation(payload) {
  const stationName = String(payload.name || "").trim();
  const existingStation = fetchMenuStationsSync().find((station) => slugify(station.name) === slugify(stationName));

  if (existingStation) {
    return existingStation;
  }

  const station = {
    id: `station-${Date.now()}`,
    name: stationName
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
  const categoryName = String(payload.name || "").trim();
  const existingCategory = fetchMenuCategoriesSync().find(
    (category) => slugify(category.name) === slugify(categoryName)
  );

  if (existingCategory) {
    return existingCategory;
  }

  const category = {
    id: `cat-${Date.now()}`,
    name: categoryName,
    itemCount: 0,
    availableFrom: payload.availableFrom || "",
    availableTo: payload.availableTo || "",
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
    availableFrom: payload.availableFrom || "",
    availableTo: payload.availableTo || "",
    taxMode: payload.taxMode || "Exclusive",
    taxRate: Number(payload.taxRate || 0),
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
    takeawayPrice: payload.takeawayPrice || payload.pricing?.[0]?.takeaway || "Rs 0",
    deliveryPrice: payload.deliveryPrice || payload.pricing?.[0]?.delivery || "Rs 0",
    parcelCharges: payload.parcelCharges || {
      takeaway: { type: "None", value: 0 },
      delivery: { type: "None", value: 0 }
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

async function updateMenuItem(id, payload) {
  let updatedItem = null;

  updateOwnerSetupData((current) => {
    const existingItem = current.menu.items.find((item) => item.id === id);

    if (!existingItem) {
      return current;
    }

    const previousCategoryId = existingItem.categoryId;
    const nextCategoryId = payload.categoryId || previousCategoryId;

    updatedItem = {
      ...existingItem,
      ...payload,
      categoryId: nextCategoryId,
      inventoryTracking: {
        ...existingItem.inventoryTracking,
        ...(payload.inventoryTracking || {})
      },
      pricing: payload.pricing || existingItem.pricing,
      takeawayPrice: payload.takeawayPrice || existingItem.takeawayPrice,
      deliveryPrice: payload.deliveryPrice || existingItem.deliveryPrice,
      taxMode: payload.taxMode || existingItem.taxMode,
      taxRate: payload.taxRate !== undefined ? Number(payload.taxRate || 0) : existingItem.taxRate,
      parcelCharges: payload.parcelCharges || existingItem.parcelCharges,
      outletAvailability: payload.outletAvailability || existingItem.outletAvailability,
      badges: payload.badges || existingItem.badges
    };

    return {
      ...current,
      menu: {
        ...current.menu,
        categories: current.menu.categories.map((category) => {
          if (category.id === previousCategoryId && previousCategoryId !== nextCategoryId) {
            return { ...category, itemCount: Math.max(0, Number(category.itemCount || 0) - 1) };
          }

          if (category.id === nextCategoryId && previousCategoryId !== nextCategoryId) {
            return { ...category, itemCount: Number(category.itemCount || 0) + 1 };
          }

          return category;
        }),
        items: current.menu.items.map((item) => (item.id === id ? updatedItem : item))
      }
    };
  });

  return updatedItem;
}

async function deleteMenuItem(id) {
  let deletedItem = null;

  updateOwnerSetupData((current) => {
    deletedItem = current.menu.items.find((item) => item.id === id) || null;

    if (!deletedItem) {
      return current;
    }

    return {
      ...current,
      menu: {
        ...current.menu,
        categories: current.menu.categories.map((category) =>
          category.id === deletedItem.categoryId
            ? { ...category, itemCount: Math.max(0, Number(category.itemCount || 0) - 1) }
            : category
        ),
        items: current.menu.items.filter((item) => item.id !== id)
      }
    };
  });

  return deletedItem;
}

async function deleteMenuCategory(id) {
  let deletedCategory = null;

  updateOwnerSetupData((current) => {
    deletedCategory = current.menu.categories.find((category) => category.id === id) || null;

    if (!deletedCategory) {
      return current;
    }

    return {
      ...current,
      menu: {
        ...current.menu,
        categories: current.menu.categories.filter((category) => category.id !== id),
        items: current.menu.items.filter((item) => item.categoryId !== id),
        menuGroups: (current.menu.menuGroups || []).map((menuGroup) => ({
          ...menuGroup,
          categoryIds: (menuGroup.categoryIds || []).filter((categoryId) => categoryId !== id)
        }))
      }
    };
  });

  return deletedCategory;
}

async function updateMenuConfig(payload) {
  let updatedConfig = null;

  updateOwnerSetupData((current) => {
    updatedConfig = {
      ...(current.menu.config || {}),
      ...payload
    };

    return {
      ...current,
      menu: {
        ...current.menu,
        config: updatedConfig
      }
    };
  });

  return updatedConfig;
}

async function createMenuGroup(payload) {
  const menuGroup = {
    id: `group-${Date.now()}`,
    name: payload.name,
    status: payload.status || "Live",
    categoryIds: payload.categoryIds || [],
    channels: payload.channels || "Dine-In, Takeaway",
    availability: payload.availability || "Always on",
    note: payload.note || ""
  };

  updateOwnerSetupData((current) => ({
    ...current,
    menu: {
      ...current.menu,
      menuGroups: [menuGroup, ...(current.menu.menuGroups || [])]
    }
  }));

  return menuGroup;
}

async function updateMenuGroup(id, payload) {
  let updatedGroup = null;

  updateOwnerSetupData((current) => ({
    ...current,
    menu: {
      ...current.menu,
      menuGroups: (current.menu.menuGroups || []).map((menuGroup) => {
        if (menuGroup.id !== id) {
          return menuGroup;
        }

        updatedGroup = {
          ...menuGroup,
          ...payload
        };
        return updatedGroup;
      })
    }
  }));

  return updatedGroup;
}

async function createMenuAssignment(payload) {
  const assignment = {
    id: `assignment-${Date.now()}`,
    menuGroupId: payload.menuGroupId,
    outletId: payload.outletId,
    channels: payload.channels || "Dine-In, Takeaway",
    availability: payload.availability || "Always on",
    status: payload.status || "Ready"
  };

  updateOwnerSetupData((current) => ({
    ...current,
    menu: {
      ...current.menu,
      menuAssignments: [assignment, ...(current.menu.menuAssignments || [])]
    }
  }));

  return assignment;
}

async function updateMenuAssignment(id, payload) {
  let updatedAssignment = null;

  updateOwnerSetupData((current) => ({
    ...current,
    menu: {
      ...current.menu,
      menuAssignments: (current.menu.menuAssignments || []).map((assignment) => {
        if (assignment.id !== id) {
          return assignment;
        }

        updatedAssignment = {
          ...assignment,
          ...payload
        };
        return updatedAssignment;
      })
    }
  }));

  return updatedAssignment;
}

async function createPricingProfile(payload) {
  const profile = {
    id: `pricing-${Date.now()}`,
    name: payload.name,
    dineInMode: payload.dineInMode || "Area wise",
    takeawayMode: payload.takeawayMode || "Single price",
    deliveryMode: payload.deliveryMode || "Single price",
    takeawayParcelChargeType: payload.takeawayParcelChargeType || "None",
    takeawayParcelChargeValue: Number(payload.takeawayParcelChargeValue || 0),
    deliveryParcelChargeType: payload.deliveryParcelChargeType || "None",
    deliveryParcelChargeValue: Number(payload.deliveryParcelChargeValue || 0),
    isActive: Boolean(payload.isActive)
  };

  updateOwnerSetupData((current) => ({
    ...current,
    menu: {
      ...current.menu,
      pricingProfiles: [profile, ...(current.menu.pricingProfiles || []).map((entry) => ({
        ...entry,
        isActive: profile.isActive ? false : entry.isActive
      }))]
    }
  }));

  return profile;
}

async function updatePricingProfile(id, payload) {
  let updatedProfile = null;

  updateOwnerSetupData((current) => ({
    ...current,
    menu: {
      ...current.menu,
      pricingProfiles: (current.menu.pricingProfiles || []).map((profile) => {
        if (payload.isActive && profile.id !== id) {
          return { ...profile, isActive: false };
        }

        if (profile.id !== id) {
          return profile;
        }

        updatedProfile = {
          ...profile,
          ...payload,
          takeawayParcelChargeValue:
            payload.takeawayParcelChargeValue !== undefined
              ? Number(payload.takeawayParcelChargeValue || 0)
              : profile.takeawayParcelChargeValue,
          deliveryParcelChargeValue:
            payload.deliveryParcelChargeValue !== undefined
              ? Number(payload.deliveryParcelChargeValue || 0)
              : profile.deliveryParcelChargeValue
        };

        return updatedProfile;
      })
    }
  }));

  return updatedProfile;
}

async function bulkImportMenuItems(payload) {
  const rows = Array.isArray(payload.rows) ? payload.rows : [];
  const createdItems = [];

  for (const row of rows) {
    const categoryName = String(row.categoryName || row.category || "Imported").trim();
    const stationName = String(row.station || "Main kitchen").trim();

    let category = fetchMenuCategoriesSync().find((entry) => slugify(entry.name) === slugify(categoryName));
    if (!category) {
      category = await createMenuCategory({ name: categoryName });
    }

    let station = fetchMenuStationsSync().find((entry) => slugify(entry.name) === slugify(stationName));
    if (!station) {
      station = await createMenuStation({ name: stationName });
    }

    const takeawayPrice = `Rs ${Number(row.takeawayPrice || 0)}`;
    const deliveryPrice = `Rs ${Number(row.deliveryPrice || 0)}`;

    createdItems.push(
      await createMenuItem({
        categoryId: category.id,
        name: row.itemName,
        station: station.name,
        foodType: row.foodType || "Veg",
        takeawayPrice,
        deliveryPrice,
        parcelCharges: {
          takeaway: {
            type: row.takeawayParcelChargeType || "None",
            value: Number(row.takeawayParcelChargeValue || 0)
          },
          delivery: {
            type: row.deliveryParcelChargeType || "None",
            value: Number(row.deliveryParcelChargeValue || 0)
          }
        },
        pricing: [
          {
            area: "AC",
            dineIn: `Rs ${Number(row.acDineIn || 0)}`,
            takeaway: takeawayPrice,
            delivery: deliveryPrice
          },
          {
            area: "Non-AC",
            dineIn: `Rs ${Number(row.nonAcDineIn || 0)}`,
            takeaway: takeawayPrice,
            delivery: deliveryPrice
          },
          {
            area: "Self Service",
            dineIn: `Rs ${Number(row.selfDineIn || 0)}`,
            takeaway: takeawayPrice,
            delivery: deliveryPrice
          }
        ]
      })
    );
  }

  return {
    importedCount: createdItems.length,
    createdItems
  };
}

function fetchMenuStationsSync() {
  return getOwnerSetupData().menu.stations || [];
}

function fetchMenuCategoriesSync() {
  return getOwnerSetupData().menu.categories || [];
}

module.exports = {
  fetchMenuCategories,
  fetchMenuStations,
  fetchMenuItems,
  fetchMenuConfig,
  fetchMenuGroups,
  fetchMenuAssignments,
  fetchPricingProfiles,
  createMenuStation,
  createMenuCategory,
  createMenuItem,
  updateMenuCategory,
  deleteMenuCategory,
  updateMenuItem,
  deleteMenuItem,
  updateMenuConfig,
  createMenuGroup,
  updateMenuGroup,
  createMenuAssignment,
  updateMenuAssignment,
  createPricingProfile,
  updatePricingProfile,
  bulkImportMenuItems
};
