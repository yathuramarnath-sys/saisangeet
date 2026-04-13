import { inventorySeedData } from "./inventory.seed";
import {
  loadRestaurantState,
  recordInventoryWaste,
  updateInventoryState
} from "../../../../../packages/shared-types/src/mockRestaurantStore.js";

export async function fetchInventoryData() {
  const state = loadRestaurantState();

  return {
    accessCards: inventorySeedData.accessCards,
    alerts: inventorySeedData.alerts,
    diningItems: state.inventory?.diningItems || [],
    productionItems: state.inventory?.productionItems || [],
    wasteLog: state.inventory?.wasteLog || []
  };
}

export function toggleDiningItemStatus(itemId) {
  return updateInventoryState((current) => ({
    ...current,
    diningItems: current.diningItems.map((item) => {
      if (item.id !== itemId) {
        return item;
      }

      if (item.status === "Out of Stock") {
        return {
          ...item,
          quantity: 12,
          status: "Available",
          quantityLabel: "12 portions",
          alert: "Normal sale flow"
        };
      }

      return {
        ...item,
        quantity: 0,
        status: "Out of Stock",
        quantityLabel: "0 portions",
        alert: "Blocked from captain quick-add flow"
      };
    })
  }));
}

export function toggleProductionStock(itemId) {
  return updateInventoryState((current) => ({
    ...current,
    productionItems: current.productionItems.map((item) => {
      if (item.id !== itemId) {
        return item;
      }

      return item.status === "Healthy"
        ? {
            ...item,
            quantity: Math.max(0, Number(item.threshold || 0) - 1),
            status: "Low Stock",
            quantityLabel: "Refill needed",
            alert: "Manager should review issue quantity"
          }
        : {
            ...item,
            quantity: Math.max(Number(item.threshold || 0) + 6, 10),
            status: "Healthy",
            quantityLabel: `Restocked ${item.unit}`,
            alert: "Production stock normalized"
          };
    })
  }));
}

export function addProductionWaste(itemId) {
  return recordInventoryWaste(itemId, 0.5, "Kitchen waste entry", "Store Incharge");
}
