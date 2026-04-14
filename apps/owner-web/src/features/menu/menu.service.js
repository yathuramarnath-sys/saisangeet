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
    pricing: item.pricing || [],
    actions: item.actions || ["Edit"],
    review: item.status === "Review",
    compact: item.status === "Review"
  }));
}

export async function fetchMenuData() {
  try {
    const [categories, items] = await Promise.all([api.get("/menu/categories"), api.get("/menu/items")]);

    return mergeMenuState({
      categories: categories.map((category, index) => ({
        id: category.id,
        name: category.name,
        count: category.itemCount ?? 0,
        active: index === 0
      })),
      items,
      menuGroups: menuSeedData.menuGroups,
      menuAssignments: menuSeedData.menuAssignments,
      menuAlerts: menuSeedData.menuAlerts
    });
  } catch (_error) {
    return mergeMenuState(menuSeedData);
  }
}

export async function createCustomMenuItem(formValues) {
  const itemName = String(formValues.itemName || "").trim();
  const categoryName = String(formValues.categoryName || "").trim();

  if (!itemName || !categoryName) {
    throw new Error("Item name and category are required.");
  }

  const categoryId = slugify(categoryName);

  try {
    const categories = await api.get("/menu/categories");
    const existingCategory = categories.find((category) => slugify(category.name) === categoryId);
    const finalCategory =
      existingCategory ||
      (await api.post("/menu/categories", {
        name: categoryName
      }));

    return api.post("/menu/items", {
      categoryId: finalCategory.id,
      name: itemName,
      station: formValues.station || "Main kitchen",
      gstLabel: "GST 5%",
      status: "Live",
      foodType: formValues.foodType || "Veg",
      badges: ["Custom item", "Available"],
      salesAvailability: "Available",
      outletAvailability: [
        { outlet: "Indiranagar", enabled: true },
        { outlet: "Koramangala", enabled: true },
        { outlet: "HSR Layout", enabled: true }
      ],
      inventoryTracking: {
        enabled: formValues.trackInventory === "Enabled",
        mode: formValues.entryStyle || "Optional later",
        note:
          formValues.trackInventory === "Enabled"
            ? "Track sellable stock for POS and waiter ordering"
            : "Inventory tracking is disabled for this item. Enable only if this product should use sales stock control."
      },
      pricing: [
        {
          area: "AC",
          dineIn: buildPriceLabel(formValues.acDineIn),
          takeaway: buildPriceLabel(formValues.acTakeaway),
          delivery: buildPriceLabel(formValues.acDelivery)
        },
        {
          area: "Non-AC",
          dineIn: buildPriceLabel(formValues.nonAcDineIn),
          takeaway: buildPriceLabel(formValues.nonAcTakeaway),
          delivery: buildPriceLabel(formValues.nonAcDelivery)
        },
        {
          area: "Self Service",
          dineIn: buildPriceLabel(formValues.selfDineIn),
          takeaway: buildPriceLabel(formValues.selfTakeaway),
          delivery: buildPriceLabel(formValues.selfDelivery)
        }
      ]
    });
  } catch {
    const customState = loadCustomMenuState();
    const itemId = `${slugify(itemName)}-${Date.now()}`;
    const newItem = {
      id: itemId,
      name: itemName,
      categoryId,
      categoryName,
      station: formValues.station || "Main kitchen",
      gstLabel: "GST 5%",
      status: "Live",
      foodType: formValues.foodType || "Veg",
      badges: ["Custom item", "Available"],
      inventoryTracking: {
        enabled: formValues.trackInventory === "Enabled",
        mode: formValues.entryStyle || "Optional later",
        note:
          formValues.trackInventory === "Enabled"
            ? "Track sellable stock for POS and waiter ordering"
            : "Inventory tracking is disabled for this item. Enable only if this product should use sales stock control."
      },
      salesAvailability: "Available",
      outletAvailability: [
        { outlet: "Indiranagar", enabled: true },
        { outlet: "Koramangala", enabled: true },
        { outlet: "HSR Layout", enabled: true }
      ],
      pricing: [
        {
          area: "AC",
          dineIn: buildPriceLabel(formValues.acDineIn),
          takeaway: buildPriceLabel(formValues.acTakeaway),
          delivery: buildPriceLabel(formValues.acDelivery)
        },
        {
          area: "Non-AC",
          dineIn: buildPriceLabel(formValues.nonAcDineIn),
          takeaway: buildPriceLabel(formValues.nonAcTakeaway),
          delivery: buildPriceLabel(formValues.nonAcDelivery)
        },
        {
          area: "Self Service",
          dineIn: buildPriceLabel(formValues.selfDineIn),
          takeaway: buildPriceLabel(formValues.selfTakeaway),
          delivery: buildPriceLabel(formValues.selfDelivery)
        }
      ],
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
