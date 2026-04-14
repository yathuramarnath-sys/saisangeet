import { api } from "../../lib/api";
import { menuSeedData } from "./menu.seed";

function normalizeMenuItems(items) {
  return items.map((item) => ({
    id: item.id,
    name: item.name,
    station: item.station || "Station pending",
    gstLabel: item.gstLabel || "GST pending",
    status: item.status || "Live",
    foodType: item.foodType || "Veg",
    badges: item.badges || ["Standard pricing"],
    inventoryTracking: item.inventoryTracking || {
      enabled: false,
      mode: "Optional",
      note: "Inventory tracking is disabled for this item. Enable only if this product should use sales stock control."
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

    return {
      categories: categories.map((category, index) => ({
        id: category.id,
        name: category.name,
        count: category.itemCount ?? 0,
        active: index === 0
      })),
      items: normalizeMenuItems(items)
    };
  } catch (_error) {
    return menuSeedData;
  }
}
