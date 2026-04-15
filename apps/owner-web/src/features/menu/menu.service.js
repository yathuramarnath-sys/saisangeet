import { api } from "../../lib/api";
import { loadRestaurantState } from "../../../../../packages/shared-types/src/mockRestaurantStore.js";
import { menuSeedData } from "./menu.seed";

const CUSTOM_MENU_STORAGE_KEY = "owner-web-custom-menu";

function hasBrowserStorage() {
  return (
    typeof window !== "undefined" &&
    window.localStorage &&
    typeof window.localStorage.getItem === "function" &&
    typeof window.localStorage.setItem === "function"
  );
}

function slugify(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function loadCustomMenuState() {
  if (!hasBrowserStorage()) {
    return { categories: [], items: [] };
  }

  try {
    const raw = window.localStorage.getItem(CUSTOM_MENU_STORAGE_KEY);

    if (!raw) {
      return { categories: [], items: [] };
    }

    const parsed = JSON.parse(raw);
    return {
      categories: Array.isArray(parsed.categories) ? parsed.categories : [],
      items: Array.isArray(parsed.items) ? parsed.items : []
    };
  } catch {
    return { categories: [], items: [] };
  }
}

function saveCustomMenuState(nextState) {
  if (!hasBrowserStorage()) {
    return;
  }

  window.localStorage.setItem(CUSTOM_MENU_STORAGE_KEY, JSON.stringify(nextState));
}

function buildPriceLabel(value) {
  return `Rs ${Number(value || 0)}`;
}

function buildInventoryTracking(formValues) {
  return {
    enabled: formValues.trackInventory === "Enabled",
    mode: formValues.entryStyle || "Optional later",
    note:
      formValues.trackInventory === "Enabled"
        ? "Track sellable stock for POS and waiter ordering"
        : "Inventory tracking is disabled for this item. Enable only if this product should use sales stock control."
  };
}

function buildParcelCharge(type, value) {
  return {
    type: type || "None",
    value: Number(value || 0)
  };
}

function buildPricingRows(formValues) {
  const takeawayPrice = buildPriceLabel(formValues.takeawayPrice);
  const deliveryPrice = buildPriceLabel(formValues.deliveryPrice);

  return [
    {
      area: "AC",
      dineIn: buildPriceLabel(formValues.acDineIn),
      takeaway: takeawayPrice,
      delivery: deliveryPrice
    },
    {
      area: "Non-AC",
      dineIn: buildPriceLabel(formValues.nonAcDineIn),
      takeaway: takeawayPrice,
      delivery: deliveryPrice
    },
    {
      area: "Self Service",
      dineIn: buildPriceLabel(formValues.selfDineIn),
      takeaway: takeawayPrice,
      delivery: deliveryPrice
    }
  ];
}

async function ensureCategoryAndStation(categoryName, stationName) {
  const [categories, stations] = await Promise.all([api.get("/menu/categories"), api.get("/menu/stations")]);
  const categorySlug = slugify(categoryName);
  const stationSlug = slugify(stationName);
  const existingCategory = categories.find((category) => slugify(category.name) === categorySlug);
  const existingStation = stations.find((station) => slugify(station.name) === stationSlug);
  const finalCategory =
    existingCategory ||
    (await api.post("/menu/categories", {
      name: categoryName
    }));
  const finalStation =
    existingStation ||
    (await api.post("/menu/stations", {
      name: stationName
    }));

  return {
    category: finalCategory,
    station: finalStation
  };
}

function buildMenuItemPayload(formValues, category, stationName) {
  const taxMode = formValues.taxMode || "Exclusive";
  const taxRate = Number(formValues.taxRate || 0);

  return {
    categoryId: category.id,
    name: String(formValues.itemName || "").trim(),
    station: stationName,
    availableFrom: formValues.availableFrom || "",
    availableTo: formValues.availableTo || "",
    gstLabel: `${taxMode === "Inclusive" ? "Tax Incl" : "Tax Excl"} ${taxRate}%`,
    status: "Live",
    foodType: formValues.foodType || "Veg",
    badges: ["Custom item", "Available"],
    salesAvailability: "Available",
    outletAvailability: [
      { outlet: "Indiranagar", enabled: true },
      { outlet: "Koramangala", enabled: true },
      { outlet: "HSR Layout", enabled: true }
    ],
    inventoryTracking: buildInventoryTracking(formValues),
    takeawayPrice: buildPriceLabel(formValues.takeawayPrice),
    deliveryPrice: buildPriceLabel(formValues.deliveryPrice),
    taxMode,
    taxRate,
    parcelCharges: {
      takeaway: buildParcelCharge(formValues.takeawayParcelChargeType, formValues.takeawayParcelChargeValue),
      delivery: buildParcelCharge(formValues.deliveryParcelChargeType, formValues.deliveryParcelChargeValue)
    },
    pricing: buildPricingRows(formValues)
  };
}

function mergeMenuState(baseData) {
  const customState = loadCustomMenuState();
  const mergedItems = [...baseData.items, ...customState.items];
  const categoryMap = new Map(baseData.categories.map((category) => [category.id, { ...category }]));

  customState.categories.forEach((category) => {
    if (!categoryMap.has(category.id)) {
      categoryMap.set(category.id, { ...category, count: 0, active: false });
    }
  });

  customState.items.forEach((item) => {
    const category = categoryMap.get(item.categoryId);

    if (category) {
      category.count = Number(category.count || 0) + 1;
      return;
    }

    categoryMap.set(item.categoryId, {
      id: item.categoryId,
      name: item.categoryName || "Custom",
      count: 1,
      active: false
    });
  });

  const categories = Array.from(categoryMap.values()).map((category, index) => ({
    ...category,
    active: index === 0
  }));

  return {
    ...baseData,
    categories,
    stations: baseData.stations || [],
    items: normalizeMenuItems(mergedItems)
  };
}

function normalizeMenuItems(items) {
  const state = loadRestaurantState();
  const menuControls = state.menuControls || {};
  const diningInventoryById = Object.fromEntries((state.inventory?.diningItems || []).map((item) => [item.id, item]));

  return items.map((item) => ({
    id: item.id,
    name: item.name,
    categoryId: item.categoryId,
    categoryName: item.categoryName,
    station: item.station || "Station pending",
    gstLabel: item.gstLabel || "GST pending",
    status: item.status || "Live",
    foodType: item.foodType || "Veg",
    badges: item.badges || ["Standard pricing"],
    salesAvailability: menuControls[item.id]?.salesAvailability || item.salesAvailability || "Available",
    outletAvailability:
      item.outletAvailability?.map((entry) => ({
        ...entry,
        enabled: menuControls[item.id]?.outletAvailability?.[entry.outlet] ?? entry.enabled
      })) || [],
    inventoryTracking: {
      ...(item.inventoryTracking || {
        enabled: false,
        mode: "Optional",
        note: "Inventory tracking is disabled for this item. Enable only if this product should use sales stock control."
      }),
      enabled: diningInventoryById[item.id]?.trackingEnabled ?? item.inventoryTracking?.enabled ?? false
    },
    takeawayPrice: item.takeawayPrice || item.pricing?.[0]?.takeaway || "Rs 0",
    deliveryPrice: item.deliveryPrice || item.pricing?.[0]?.delivery || "Rs 0",
    availableFrom: item.availableFrom || "",
    availableTo: item.availableTo || "",
    taxMode: item.taxMode || "Exclusive",
    taxRate: Number(item.taxRate || 0),
    parcelCharges: {
      takeaway: item.parcelCharges?.takeaway || buildParcelCharge("None", 0),
      delivery: item.parcelCharges?.delivery || buildParcelCharge("None", 0)
    },
    pricing: item.pricing || [],
    actions: item.actions || ["Edit"],
    review: item.status === "Review",
    compact: item.status === "Review"
  }));
}

export async function fetchMenuData() {
  try {
    const [categories, items, stations, config, menuGroups, menuAssignments, pricingProfiles, appConfig] =
      await Promise.all([
      api.get("/menu/categories"),
      api.get("/menu/items"),
      api.get("/menu/stations"),
      api.get("/menu/config"),
      api.get("/menu/groups"),
      api.get("/menu/assignments"),
      api.get("/menu/pricing-profiles"),
      api.get("/setup/app-config")
      ]);
    const categoriesById = Object.fromEntries(categories.map((category) => [category.id, category]));
    const outletsById = Object.fromEntries((appConfig.outlets || []).map((outlet) => [outlet.id, outlet]));
    const menuGroupsById = Object.fromEntries(menuGroups.map((menuGroup) => [menuGroup.id, menuGroup]));
    const normalizedItems = items.map((item) => ({
      ...item,
      categoryName: categoriesById[item.categoryId]?.name || item.categoryName || "Unassigned"
    }));

    return mergeMenuState({
      outlets: appConfig.outlets || [],
      taxProfiles: appConfig.taxProfiles || [],
      pricingProfiles: pricingProfiles || [],
      menuConfig: {
        defaultPricingMode: config.defaultPricingMode || "Area + order type",
        pricingZones: config.pricingZones || ["AC", "Non-AC", "Self Service"],
        orderTypes: config.orderTypes || ["Dine-In", "Takeaway", "Delivery"],
        defaultTaxProfileId: config.defaultTaxProfileId || appConfig.taxProfiles?.[0]?.id || "",
        defaultPricingProfileId: config.defaultPricingProfileId || pricingProfiles?.[0]?.id || "",
        menuStructureNote: config.menuStructureNote || "One page, simple assignment"
      },
      stations,
      categories: categories.map((category, index) => ({
        id: category.id,
        name: category.name,
        count: category.itemCount ?? 0,
        active: index === 0,
        availableFrom: category.availableFrom || "",
        availableTo: category.availableTo || "",
        station: category.station,
        printerTarget: category.printerTarget,
        displayTarget: category.displayTarget
      })),
      items: normalizedItems,
      menuGroups: menuGroups.map((menuGroup) => ({
        ...menuGroup,
        itemCount:
          menuGroup.categoryIds?.length > 0
            ? normalizedItems.filter((item) => menuGroup.categoryIds.includes(item.categoryId)).length
            : normalizedItems.length
      })),
      menuAssignments: menuAssignments.map((assignment) => ({
        ...assignment,
        menu: menuGroupsById[assignment.menuGroupId]?.name || "Unassigned menu",
        outlet: outletsById[assignment.outletId]?.name || "Unknown outlet"
      })),
      menuAlerts: menuSeedData.menuAlerts
    });
  } catch (_error) {
    return mergeMenuState(menuSeedData);
  }
}

export async function createMenuStation(name) {
  return api.post("/menu/stations", { name });
}

export async function createMenuCategory(name, options = {}) {
  return api.post("/menu/categories", {
    name,
    availableFrom: options.availableFrom || "",
    availableTo: options.availableTo || "",
    station: "Main kitchen",
    printerTarget: "Kitchen Printer 1",
    displayTarget: "Hot Kitchen Display"
  });
}

export async function updateMenuCategory(categoryId, payload) {
  return api.patch(`/menu/categories/${categoryId}`, payload);
}

export async function deleteMenuCategory(categoryId) {
  return api.delete(`/menu/categories/${categoryId}`);
}

export async function createCustomMenuItem(formValues) {
  const itemName = String(formValues.itemName || "").trim();
  const categoryName = String(formValues.categoryName || "").trim();
  const stationName = String(formValues.station || "").trim() || "Main kitchen";

  if (!itemName || !categoryName) {
    throw new Error("Item name and category are required.");
  }

  const categoryId = slugify(categoryName);

  try {
    const { category, station } = await ensureCategoryAndStation(categoryName, stationName);

    return api.post("/menu/items", buildMenuItemPayload(formValues, category, station.name));
  } catch {
    const customState = loadCustomMenuState();
    const itemId = `${slugify(itemName)}-${Date.now()}`;
    const newItem = {
      id: itemId,
      name: itemName,
      categoryId,
      categoryName,
      station: stationName,
      availableFrom: formValues.availableFrom || "",
      availableTo: formValues.availableTo || "",
      gstLabel: "GST 5%",
      status: "Live",
      foodType: formValues.foodType || "Veg",
      badges: ["Custom item", "Available"],
      inventoryTracking: buildInventoryTracking(formValues),
      taxMode: formValues.taxMode || "Exclusive",
      taxRate: Number(formValues.taxRate || 0),
      gstLabel: `${formValues.taxMode === "Inclusive" ? "Tax Incl" : "Tax Excl"} ${Number(formValues.taxRate || 0)}%`,
      salesAvailability: "Available",
      outletAvailability: [
        { outlet: "Indiranagar", enabled: true },
        { outlet: "Koramangala", enabled: true },
        { outlet: "HSR Layout", enabled: true }
      ],
      takeawayPrice: buildPriceLabel(formValues.takeawayPrice),
      deliveryPrice: buildPriceLabel(formValues.deliveryPrice),
      parcelCharges: {
        takeaway: buildParcelCharge(formValues.takeawayParcelChargeType, formValues.takeawayParcelChargeValue),
        delivery: buildParcelCharge(formValues.deliveryParcelChargeType, formValues.deliveryParcelChargeValue)
      },
      pricing: buildPricingRows(formValues),
      actions: ["Edit", "Pricing", "Disable"]
    };

    const nextState = {
      categories: customState.categories.some((category) => category.id === categoryId)
        ? customState.categories
        : [...customState.categories, { id: categoryId, name: categoryName, count: 0 }],
      items: [newItem, ...customState.items]
    };

    saveCustomMenuState(nextState);

    return newItem;
  }
}

export async function updateCustomMenuItem(itemId, formValues) {
  const itemName = String(formValues.itemName || "").trim();
  const categoryName = String(formValues.categoryName || "").trim();
  const stationName = String(formValues.station || "").trim() || "Main kitchen";

  if (!itemName || !categoryName) {
    throw new Error("Item name and category are required.");
  }

  try {
    const { category, station } = await ensureCategoryAndStation(categoryName, stationName);

    return api.patch(`/menu/items/${itemId}`, buildMenuItemPayload(formValues, category, station.name));
  } catch {
    const customState = loadCustomMenuState();
    const nextItems = customState.items.map((item) =>
      item.id === itemId
        ? {
            ...item,
            categoryId: slugify(categoryName),
            categoryName,
            name: itemName,
            station: stationName,
            availableFrom: formValues.availableFrom || "",
            availableTo: formValues.availableTo || "",
            foodType: formValues.foodType || "Veg",
            inventoryTracking: buildInventoryTracking(formValues),
            taxMode: formValues.taxMode || "Exclusive",
            taxRate: Number(formValues.taxRate || 0),
            gstLabel: `${formValues.taxMode === "Inclusive" ? "Tax Incl" : "Tax Excl"} ${Number(formValues.taxRate || 0)}%`,
            takeawayPrice: buildPriceLabel(formValues.takeawayPrice),
            deliveryPrice: buildPriceLabel(formValues.deliveryPrice),
            parcelCharges: {
              takeaway: buildParcelCharge(formValues.takeawayParcelChargeType, formValues.takeawayParcelChargeValue),
              delivery: buildParcelCharge(formValues.deliveryParcelChargeType, formValues.deliveryParcelChargeValue)
            },
            pricing: buildPricingRows(formValues)
          }
        : item
    );

    const categoryId = slugify(categoryName);
    const nextCategories = customState.categories.some((category) => category.id === categoryId)
      ? customState.categories
      : [...customState.categories, { id: categoryId, name: categoryName, count: 0 }];

    saveCustomMenuState({
      categories: nextCategories,
      items: nextItems
    });

    return nextItems.find((item) => item.id === itemId);
  }
}

export async function deleteCustomMenuItem(itemId) {
  try {
    return api.delete(`/menu/items/${itemId}`);
  } catch {
    const customState = loadCustomMenuState();
    const nextState = {
      ...customState,
      items: customState.items.filter((item) => item.id !== itemId)
    };

    saveCustomMenuState(nextState);
    return { id: itemId };
  }
}

export async function updateMenuConfiguration(payload) {
  return api.patch("/menu/config", payload);
}

export async function createMenuGroup(payload) {
  return api.post("/menu/groups", payload);
}

export async function updateMenuGroup(groupId, payload) {
  return api.patch(`/menu/groups/${groupId}`, payload);
}

export async function createMenuAssignment(payload) {
  return api.post("/menu/assignments", payload);
}

export async function updateMenuAssignment(assignmentId, payload) {
  return api.patch(`/menu/assignments/${assignmentId}`, payload);
}

export async function createPricingProfile(payload) {
  return api.post("/menu/pricing-profiles", payload);
}

export async function updatePricingProfile(profileId, payload) {
  return api.patch(`/menu/pricing-profiles/${profileId}`, payload);
}

export async function bulkImportMenuItems(rows) {
  return api.post("/menu/import", { rows });
}
