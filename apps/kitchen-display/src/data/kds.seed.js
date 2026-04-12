import { sharedOrders, sharedStations } from "../../../../packages/shared-types/src/restaurantFlow.js";

export const stations = sharedStations;

export const kotTickets = Object.values(sharedOrders)
  .filter((order) => order.items.length > 0)
  .map((order) => ({
    id: order.kotNumber.toLowerCase(),
    kotNumber: order.kotNumber,
    tableNumber: order.tableNumber,
    areaName: order.areaName,
    stationId: order.items[0].stationId,
    stationName: order.items[0].stationName,
    captain: order.captain,
    waiter: order.assignedWaiter,
    status:
      order.pickupStatus === "ready"
        ? "ready"
        : order.pickupStatus === "preparing"
          ? "preparing"
          : order.pickupStatus === "delivered"
            ? "ready"
            : "new",
    elapsed: order.tableId === "t1" ? "01:15" : order.tableId === "t3" ? "04:20" : "07:05",
    items: order.items.map((item, index) => ({
      id: `${order.kotNumber}-item-${index + 1}`,
      name: item.name,
      quantity: item.quantity,
      note: item.note
    }))
  }));
