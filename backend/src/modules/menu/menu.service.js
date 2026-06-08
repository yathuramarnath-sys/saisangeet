const { getOwnerSetupData, updateOwnerSetupData } = require("../../data/owner-setup-store");
const { updateItemPrice } = require("../online-orders/urbanpiper.service");

function slugify(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function fetchMenuCategories(outletId) {
  const data       = getOwnerSetupData();
  const categories = data.menu?.categories || [];

  if (!outletId) return categories;

  // Resolve outlet name from id
  const outlets    = data.outlets || [];
  const outlet     = outlets.find(o => String(o.id) === String(outletId));
  const outletName = outlet?.name || "";

  if (!outletName) return categories;

  // Only return categories that have at least one item available at this outlet
  const items = data.menu?.items || [];
  const availCategoryIds = new Set(
    items
      .filter(item => {
        const avail = item.outletAvailability || [];
        if (avail.length === 0) return true;               // no restrictions → everywhere
        const entry = avail.find(a => a.outlet === outletName);
        if (!entry) return true;                           // outlet not listed → default on
        return entry.enabled !== false;
      })
      .map(item => item.categoryId)
  );

  return categories.filter(c => availCategoryIds.has(c.id));
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

async function fetchMenuItems(outletId) {
  const data       = getOwnerSetupData();
  const items      = data.menu?.items      || [];
  const categories = data.menu?.categories || [];
  // Build a fast id→name lookup so every item gets its categoryName enriched.
  // This means Inventory page / KDS stock tab / Captain menu all receive
  // categoryName without needing their own join logic.
  const catById = Object.fromEntries(categories.map(c => [c.id, c.name]));

  let filtered = items;

  if (outletId) {
    // Resolve outlet name from id
    const outlets    = data.outlets || [];
    const outlet     = outlets.find(o => String(o.id) === String(outletId));
    const outletName = outlet?.name || "";

    if (outletName) {
      filtered = items.filter(item => {
        const avail = item.outletAvailability || [];
        if (avail.length === 0) return true;               // no restrictions → everywhere
        const entry = avail.find(a => a.outlet === outletName);
        if (!entry) return true;                           // outlet not listed → default on
        return entry.enabled !== false;
      });
    }
  }

  return filtered.map(item => ({
    ...item,
    price:        computeItemPrice(item),
    categoryName: item.categoryName || catById[item.categoryId] || "",
  }));
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
    station: payload.station || "",
    printerTarget: payload.printerTarget || "",
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
  const base = Number(payload.basePrice || payload.price || 0);
  const item = {
    id: `item-${Date.now()}`,
    categoryId: payload.categoryId,
    name: payload.name,
    station: payload.station || "",
    gstLabel: payload.gstLabel || `GST ${Number(payload.taxRate || 0)}%`,
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
      enabled: false, mode: "Item wise",
      note: "Inventory tracking is disabled for this item",
    },
    // ── New pricing model ────────────────────────────────────────────────────
    price:       base,
    basePrice:   base,
    onlinePrice: Number(payload.onlinePrice || 0),
    areaOverrides:         payload.areaOverrides         || {},
    takeawayPackingCharge: Number(payload.takeawayPackingCharge || 0),
    deliveryPackingCharge: Number(payload.deliveryPackingCharge || 0),
    // ── Legacy compat ────────────────────────────────────────────────────────
    takeawayPrice: payload.takeawayPrice || `Rs ${base}`,
    deliveryPrice: payload.deliveryPrice || `Rs ${base}`,
    parcelCharges: payload.parcelCharges || {
      takeaway: { type: "None", value: 0 },
      delivery: { type: "None", value: 0 },
    },
    pricing: payload.pricing || [],
    // ── Optional fields ──────────────────────────────────────────────────────
    description:       payload.description       || "",
    shortCode:         payload.shortCode         || "",
    hsnCode:           payload.hsnCode           || "",
    sku:               payload.sku               || null, // auto-assigned below
    scalePlu:          payload.scalePlu          || null,
    rank:              payload.rank !== undefined ? Number(payload.rank) : 999,
    exposeInCaptain:   payload.exposeInCaptain   !== undefined ? Boolean(payload.exposeInCaptain)   : true,
    allowDecimalQty:   payload.allowDecimalQty   !== undefined ? Boolean(payload.allowDecimalQty)   : false,
    manufacturingDate: payload.manufacturingDate || "",
    expiryDate:        payload.expiryDate        || "",
  };

  updateOwnerSetupData((current) => {
    // Auto-assign sequential item number as SKU if not provided
    // Scans all existing items, finds the highest numeric SKU, adds 1
    if (!item.sku) {
      const existingItems = current.menu?.items || [];
      const maxNum = existingItems.reduce((max, i) => {
        const n = parseInt(i.sku, 10);
        return !isNaN(n) && n > max ? n : max;
      }, 0);
      item.sku = String(maxNum + 1);
    }
    return {
      ...current,
      menu: {
        ...current.menu,
        categories: current.menu.categories.map((category) =>
          category.id === item.categoryId
            ? { ...category, itemCount: Number(category.itemCount || 0) + 1 }
            : category
        ),
        items: [item, ...current.menu.items],
      },
    };
  });

  return item;
}

async function updateMenuItem(id, payload) {
  let updatedItem = null;
  let oldOnlinePrice = null;

  updateOwnerSetupData((current) => {
    const existingItem = current.menu.items.find((item) => item.id === id);
    if (existingItem) oldOnlinePrice = existingItem.onlinePrice || 0;

    if (!existingItem) {
      return current;
    }

    const previousCategoryId = existingItem.categoryId;
    const nextCategoryId = payload.categoryId || previousCategoryId;

    const base = payload.basePrice !== undefined ? Number(payload.basePrice || 0)
               : payload.price    !== undefined ? Number(payload.price    || 0)
               : existingItem.basePrice || existingItem.price || 0;

    updatedItem = {
      ...existingItem,
      ...payload,
      categoryId: nextCategoryId,
      inventoryTracking: {
        ...existingItem.inventoryTracking,
        ...(payload.inventoryTracking || {}),
      },
      // New pricing model
      price:       base,
      basePrice:   base,
      onlinePrice: payload.onlinePrice !== undefined ? Number(payload.onlinePrice || 0) : (existingItem.onlinePrice || 0),
      areaOverrides:         payload.areaOverrides         !== undefined ? (payload.areaOverrides || {})          : (existingItem.areaOverrides         || {}),
      takeawayPackingCharge: payload.takeawayPackingCharge !== undefined ? Number(payload.takeawayPackingCharge)  : (existingItem.takeawayPackingCharge  ?? 0),
      deliveryPackingCharge: payload.deliveryPackingCharge !== undefined ? Number(payload.deliveryPackingCharge)  : (existingItem.deliveryPackingCharge  ?? 0),
      // Legacy compat
      pricing:            payload.pricing            || existingItem.pricing,
      takeawayPrice:      payload.takeawayPrice      || existingItem.takeawayPrice,
      deliveryPrice:      payload.deliveryPrice      || existingItem.deliveryPrice,
      taxMode:            payload.taxMode            || existingItem.taxMode,
      taxRate:            payload.taxRate            !== undefined ? Number(payload.taxRate || 0) : existingItem.taxRate,
      parcelCharges:      payload.parcelCharges      || existingItem.parcelCharges,
      outletAvailability: payload.outletAvailability || existingItem.outletAvailability,
      badges:             payload.badges             || existingItem.badges,
      // Optional fields
      rank:            payload.rank            !== undefined ? Number(payload.rank)           : (existingItem.rank            ?? 999),
      exposeInCaptain: payload.exposeInCaptain !== undefined ? Boolean(payload.exposeInCaptain) : (existingItem.exposeInCaptain ?? true),
      allowDecimalQty: payload.allowDecimalQty !== undefined ? Boolean(payload.allowDecimalQty) : (existingItem.allowDecimalQty ?? false),
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

  if (updatedItem && payload.onlinePrice !== undefined) {
    const newPrice = Number(payload.onlinePrice || 0);
    if (newPrice !== oldOnlinePrice) {
      updateItemPrice(id, newPrice, getOwnerSetupData()).catch(() => {});
    }
  }

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
  const rows           = Array.isArray(payload.rows) ? payload.rows : [];
  const targetOutletId = payload.targetOutletId || "all";
  const createdItems   = [];
  const errors         = [];

  // ── Read current store state ONCE ───────────────────────────────────────────
  const currentData = getOwnerSetupData();
  const outlets     = currentData.outlets || [];

  // Build outletAvailability — if a specific branch is targeted, only that
  // outlet is enabled; all others are disabled.
  const outletAvailability = outlets.map((o) => ({
    outlet:  o.name,
    enabled: targetOutletId === "all" ? true : o.id === targetOutletId,
  }));

  const allWorkAreas = [...new Set(
    outlets.flatMap((o) => o.workAreas || ["AC", "Non-AC", "Self Service"])
  )];
  const pricingAreas = allWorkAreas.length > 0
    ? allWorkAreas
    : ["AC", "Non-AC", "Self Service"];

  // Work with in-memory copies — NO individual store writes per row
  const categories = [...(currentData.menu?.categories || [])];
  const stations   = [...(currentData.menu?.stations   || [])];
  const newItems   = [];

  // ── Category + station dedup maps ───────────────────────────────────────────
  const catBySlug = Object.fromEntries(categories.map(c => [slugify(c.name), c]));
  const staBySlug = Object.fromEntries(stations.map(s => [slugify(s.name), s]));

  // ── Deduplicate within the submitted batch (itemName + categoryName) ─────────
  // Safety net: frontend already deduplicates, but guard here too in case the
  // API is called directly or the CSV had rows the frontend dedup couldn't catch.
  const _seenKeys = new Set();
  const uniqueRows = rows.filter((row) => {
    const name = String(row.itemName     || "").trim().toLowerCase();
    const cat  = String(row.categoryName || row.category || "").trim().toLowerCase();
    if (!name) return true; // no name → let the error block below handle it
    const key = `${name}|||${cat}`;
    if (_seenKeys.has(key)) return false;
    _seenKeys.add(key);
    return true;
  });

  for (const row of uniqueRows) {
    const itemName     = String(row.itemName     || "").trim();
    const categoryName = String(row.categoryName || row.category || "Imported").trim();
    const stationName  = String(row.station      || "").trim();

    if (!itemName || !categoryName) {
      errors.push({ row, reason: "Missing item name or category" });
      continue;
    }

    // ── Ensure category exists (in-memory only) ──────────────────────────────
    const catSlug = slugify(categoryName);
    if (!catBySlug[catSlug]) {
      const newCat = {
        id:            `cat-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        name:          categoryName,
        station:       "",
        printerTarget: "",
        displayTarget: "",
      };
      categories.push(newCat);
      catBySlug[catSlug] = newCat;
    }
    const category = catBySlug[catSlug];

    // ── Station lookup — NEVER auto-create stations from CSV ─────────────────
    // Stations are created exclusively from Kitchen Stations page in Owner Console.
    // CSV import only links items to EXISTING stations — if the station name in
    // the CSV doesn't match a saved station, the item is imported without a station
    // assignment (station field stays blank). This prevents phantom stations appearing
    // (e.g. "Bakery", "Beverages") every time a menu CSV is re-imported.
    const staSlug = stationName ? slugify(stationName) : "";
    const station = staSlug ? (staBySlug[staSlug] || null) : null;

    // ── Build item (in-memory only) ──────────────────────────────────────────
    const taxRate    = row.taxRate != null && row.taxRate !== "" ? Number(row.taxRate) : 5;
    const taxMode    = row.taxMode === "Inclusive" ? "Inclusive" : "Exclusive";
    const gstLabel   = `GST ${taxRate}%`;
    const rwTakeaway = `Rs ${Number(row.takeawayPrice || 0)}`;
    const rwDelivery = `Rs ${Number(row.deliveryPrice || 0)}`;

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

    const newItem = {
      id:                `item-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      categoryId:        category.id,
      categoryName:      category.name,
      name:              itemName,
      station:           station?.name || "",
      foodType:          row.foodType || "Veg",
      taxMode,
      taxRate,
      gstLabel,
      status:            "Live",
      salesAvailability: "Available",
      takeawayPrice:     rwTakeaway,
      deliveryPrice:     rwDelivery,
      outletAvailability,
      pricing,
      parcelCharges: {
        takeaway: { type: "None", value: 0 },
        delivery: { type: "None", value: 0 },
      },
      description:       String(row.description       || "").trim(),
      shortCode:         String(row.shortCode         || "").trim().toUpperCase(),
      hsnCode:           String(row.hsnCode           || "").trim(),
      sku:               String(row.sku               || "").trim() || null, // auto-assigned below
      scalePlu:          row.scalePlu        !== undefined && row.scalePlu !== null ? String(row.scalePlu).trim() || null : null,
      rank:              row.rank            !== undefined ? Number(row.rank)            : 999,
      packingCharges:    row.packingCharges   !== undefined ? Number(row.packingCharges)  : 0,
      exposeInCaptain:   row.exposeInCaptain  !== undefined ? Boolean(row.exposeInCaptain): true,
      allowDecimalQty:   row.allowDecimalQty  !== undefined ? Boolean(row.allowDecimalQty): false,
      manufacturingDate: String(row.manufacturingDate || "").trim(),
      expiryDate:        String(row.expiryDate        || "").trim(),
    };

    newItems.push(newItem);
    createdItems.push(newItem);
  }

  // ── ONE single store write for everything ────────────────────────────────────
  if (newItems.length > 0) {
    updateOwnerSetupData((current) => {
      // Auto-assign sequential SKU numbers to items that don't have one
      const existingItems = current.menu?.items || [];
      let maxNum = existingItems.reduce((max, i) => {
        const n = parseInt(i.sku, 10);
        return !isNaN(n) && n > max ? n : max;
      }, 0);
      for (const item of newItems) {
        if (!item.sku) {
          maxNum++;
          item.sku = String(maxNum);
        }
      }
      return {
        ...current,
        menu: {
          ...current.menu,
          categories,
          stations,
          items: [...existingItems, ...newItems],
        },
      };
    });
  }

  return {
    importedCount: createdItems.length,
    errorCount:    errors.length,
    errors,
    createdItems,
  };
}

// ── SKU lookup — for barcode scanner at POS ───────────────────────────────────
async function lookupItemBySku(sku) {
  const trimmed = String(sku || "").trim();
  if (!trimmed) return null;
  const items = await fetchMenuItems();
  return items.find((item) => item.sku && item.sku.trim() === trimmed) || null;
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
  lookupItemBySku,
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
