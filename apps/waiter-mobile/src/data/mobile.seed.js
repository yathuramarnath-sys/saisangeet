import {
  sharedAreas,
  sharedCategories,
  sharedKitchenInstructions,
  sharedMenuItems,
  sharedOrders,
  sharedStaffProfiles,
  sharedWaiterTeam
} from "../../../../packages/shared-types/src/restaurantFlow.js";

export const staffProfiles = sharedStaffProfiles;

export const waiterTeam = sharedWaiterTeam;

export const mobileAreas = sharedAreas
  .filter((area) => area.id !== "self-service")
  .map((area) => ({
    id: area.id,
    name: area.name,
    tables: area.tables.map((table) => ({
      id: table.id,
      number: table.number,
      seats: table.seats,
      guests: table.guests,
      status: table.status === "available" ? "open" : table.status,
      captain: table.captain
    }))
  }));

export const mobileCategories = sharedCategories;

export const mobileMenuItems = sharedMenuItems;

export const mobileInstructions = sharedKitchenInstructions;

export const mobileOrders = Object.fromEntries(
  Object.entries(sharedOrders)
    .filter(([key]) => !key.startsWith("s"))
    .map(([key, order]) => [
      key,
      {
        tableId: order.tableId,
        tableNumber: order.tableNumber,
        areaName: order.areaName,
        guests: order.guests,
        captain: order.captain,
        assignedWaiter: order.assignedWaiter,
        pickupStatus: order.pickupStatus,
        items: order.items.map((item) => ({
          id: item.id,
          name: item.name,
          price: item.price,
          quantity: item.quantity,
          note: item.note,
          sentToKot: item.sentToKot
        })),
        statusNote: order.notes
      }
    ])
);
