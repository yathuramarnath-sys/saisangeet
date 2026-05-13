import {
  sharedAreas,
  sharedCategories,
  sharedKitchenInstructions,
  sharedMenuItems,
  sharedOrders,
  sharedServiceModes
} from "../../../../packages/shared-types/src/restaurantFlow.js";

export const serviceModes = sharedServiceModes;

export const areas = sharedAreas.map((area) => ({
  id: area.id,
  name: area.name,
  tables: area.tables.map((table) => ({
    id: table.id,
    number: table.number,
    seats: table.seats,
    status: table.status === "available" ? "available" : table.status,
    captain: table.captain === "Captain Karthik" ? "Karthik" : table.captain,
    guests: table.guests
  }))
}));

export const categories = sharedCategories.map((category) => {
  if (category.id === "mains") {
    return { id: "biryani", name: "Biryani" };
  }

  if (category.id === "drinks") {
    return { id: "beverages", name: "Beverages" };
  }

  return category;
});

export const menuItems = sharedMenuItems
  .filter((item) => item.id !== "butter-naan")
  .map((item) => ({
    id: item.id,
    name: item.id === "sweet-lime" ? "Sweet Lime Soda" : item.name,
    price: item.price,
    station: item.stationName,
    categoryId: item.categoryId === "mains" ? "biryani" : item.categoryId === "drinks" ? "beverages" : item.categoryId
  }));

export const tableOrders = Object.fromEntries(
  Object.entries(sharedOrders).map(([key, order]) => [
    key,
    {
      orderNumber: order.orderNumber,
      tableId: order.tableId,
      tableNumber: order.tableNumber,
      areaName: order.areaName,
      captain: order.captain === "Captain Karthik" ? "Karthik" : order.captain,
      guests: order.guests,
      notes: order.notes,
      items: order.items.map((item) => ({
        id: item.id,
        menuItemId: item.menuItemId,
        name: item.name === "Sweet Lime" ? "Sweet Lime Soda" : item.name,
        quantity: item.quantity,
        price: item.price,
        note: item.note,
        sentToKot: item.sentToKot
      }))
    }
  ])
);

export const kitchenInstructions = sharedKitchenInstructions;
