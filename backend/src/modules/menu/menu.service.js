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

function extractPrice(str) {
  return Number(String(str || "").replace(/[^\d.]/g, "")) || 0;
}

function computeItemPrice(item) {
  // 1. Already has a numeric price field
  if (typeof item.price === "number" && item.price > 0) return item.price;
  // 2. Pricing array — use first entry's dine-in value
  if (Array.isArray(item.pricing) && item.pricing.length) {
    const first = item.pricing[0];
    const p = extractPrice(first.dineIn || first.price || "");
    if (p > 0) return p;
  }
  // 3. Takeaway / delivery flat fields
  const tp = extractPrice(item.takeawayPrice || "");
  if (tp > 0) return tp;
  const dp = extractPrice(item.deliveryPrice || "");
  if (dp > 0) return dp;
  return 0;
}

async function fetchMenuItems() {
  const items = getOwnerSetupData().menu.items;
  return items.map(item => ({ ...item, price: computeItemPrice(item) }));
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
    unit: payload.unit || "",
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
  const errors = [];

  // Use the customer's actual outlets for outletAvailability
  const outlets = getOwnerSetupData().outlets || [];
  const outletAvailability = outlets.map((o) => ({ outlet: o.name, enabled: true }));

  // Use customer's actual work areas from outlets (or default to standard 3)
  const allWorkAreas = [...new Set(
    outlets.flatMap((o) => o.workAreas || ["AC", "Non-AC", "Self Service"])
  )];
  const pricingAreas = allWorkAreas.length > 0
    ? allWorkAreas
    : ["AC", "Non-AC", "Self Service"];

  for (const row of rows) {
    const itemName    = String(row.itemName    || "").trim();
    const categoryName = String(row.categoryName || row.category || "Imported").trim();
    const stationName  = String(row.station      || "Main kitchen").trim();

    if (!itemName || !categoryName) {
      errors.push({ row, reason: "Missing item name or category" });
      continue;
    }

    try {
      let category = fetchMenuCategoriesSync().find(
        (entry) => slugify(entry.name) === slugify(categoryName)
      );
      if (!category) {
        category = await createMenuCategory({ name: categoryName });
      }

      let station = fetchMenuStationsSync().find(
        (entry) => slugify(entry.name) === slugify(stationName)
      );
      if (!station) {
        station = await createMenuStation({ name: stationName });
      }

      const taxRate   = Number(row.taxRate   || 5);
      const taxMode   = row.taxMode === "Inclusive" ? "Inclusive" : "Exclusive";
      const gstLabel  = `GST ${taxRate}%`;
      const rwTakeaway = `Rs ${Number(row.takeawayPrice || 0)}`;
      const rwDelivery = `Rs ${Number(row.deliveryPrice || 0)}`;

      // Build area-wise pricing using customer's actual work areas
      const areaRawPrices = {
        "AC":           Number(row.acDineIn   || row.nonAcDineIn || row.selfDineIn || 0),
        "Non-AC":       Number(row.nonAcDineIn || row.acDineIn   || row.selfDineIn || 0),
        "Self Service": Number(row.selfDineIn  || row.acDineIn   || row.nonAcDineIn || 0),
      };

      const pricing = pricingAreas.map((area) => ({
        area,
        dineIn:   `Rs ${areaRawPrices[area] ?? areaRawPrices["AC"] ?? 0}`,
        takeaway: rwTakeaway,
        delivery: rwDelivery,
      }));

      createdItems.push(
        await createMenuItem({
          categoryId:        category.id,
          name:              itemName,
          station:           station.name,
          foodType:          row.foodType || "Veg",
          taxMode,
          taxRate,
          gstLabel,
          takeawayPrice:     rwTakeaway,
          deliveryPrice:     rwDelivery,
          outletAvailability,
          pricing,
          parcelCharges: {
            takeaway: { type: "None", value: 0 },
            delivery: { type: "None", value: 0 },
          },
        })
      );
    } catch (err) {
      errors.push({ row, reason: err.message || "Failed to create item" });
    }
  }

  return {
    importedCount: createdItems.length,
    errorCount:    errors.length,
    errors,
    createdItems,
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
