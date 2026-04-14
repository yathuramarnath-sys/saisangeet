import { inventorySeedData } from "./inventory.seed";
import {
  addPurchaseInventory,
  issueProductionInventory,
  loadRestaurantState,
  recordInventoryCount,
  recordInventoryWaste,
  updateInventoryState
} from "../../../../../packages/shared-types/src/mockRestaurantStore.js";

export async function fetchInventoryData() {
  const state = loadRestaurantState();

  return {
    accessCards: inventorySeedData.accessCards,
    alerts: [
      ...inventorySeedData.alerts,
      ...(state.inventory?.productionItems || [])
        .filter((item) => item.status === "Critical")
        .map((item) => ({
          id: `critical-${item.id}`,
          title: `${item.name} is in critical stock`,
          description: "Check purchase inward, issue log, and waste before daily closing."
        }))
    ],
    diningItems: state.inventory?.diningItems || [],
    productionItems: state.inventory?.productionItems || [],
    wasteLog: state.inventory?.wasteLog || [],
    issueLog: state.inventory?.issueLog || [],
    purchaseLog: state.inventory?.purchaseLog || [],
    countLog: state.inventory?.countLog || [],
    varianceLog: state.inventory?.varianceLog || [],
    dailySummary: [
      {
        id: "daily-dining",
        label: "Dining items below threshold",
        value: `${(state.inventory?.diningItems || []).filter((item) => item.status !== "Available").length}`
      },
      {
        id: "daily-production",
        label: "Production items needing refill",
        value: `${(state.inventory?.productionItems || []).filter((item) => item.status !== "Healthy").length}`
      },
      {
        id: "daily-waste",
        label: "Waste entries today",
        value: `${(state.inventory?.wasteLog || []).length}`
      },
      {
        id: "daily-issues",
        label: "Store issues today",
        value: `${(state.inventory?.issueLog || []).length}`
      },
      {
        id: "daily-variance",
        label: "Stock mismatches today",
        value: `${(state.inventory?.varianceLog || []).length}`
      }
    ]
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

export function issueToKitchen(itemId) {
  return issueProductionInventory(itemId, 1, "Main Kitchen", "Store Incharge");
}

export function addPurchaseStock(itemId) {
  return addPurchaseInventory(itemId, 5, "A1 Traders", "Manager");
}

export function runDiningCountCheck(itemId) {
  const state = loadRestaurantState();
  const item = (state.inventory?.diningItems || []).find((entry) => entry.id === itemId);

  if (!item) {
    return state;
  }

  return recordInventoryCount(itemId, Math.max(0, Number(item.quantity || 0) - 1), "Manager");
}

export function runProductionCountCheck(itemId) {
  const state = loadRestaurantState();
  const item = (state.inventory?.productionItems || []).find((entry) => entry.id === itemId);

  if (!item) {
    return state;
  }

  const deduction = Number(item.quantity || 0) > 5 ? 1 : 0.5;
  return recordInventoryCount(itemId, Math.max(0, Number(item.quantity || 0) - deduction), "Store Incharge");
}
