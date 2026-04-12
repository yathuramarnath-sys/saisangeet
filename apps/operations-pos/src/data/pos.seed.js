export const serviceModes = [
  { id: "dine_in", label: "Dine-In", active: true },
  { id: "takeaway", label: "Takeaway" },
  { id: "delivery", label: "Delivery" }
];

export const areas = [
  {
    id: "ac-hall-1",
    name: "AC Hall 1",
    tables: [
      { id: "t1", number: "T1", seats: 4, status: "running", captain: "Karthik", guests: 3 },
      { id: "t2", number: "T2", seats: 6, status: "available", captain: "Open", guests: 0 },
      { id: "t3", number: "T3", seats: 4, status: "occupied", captain: "Naveen", guests: 4 }
    ]
  },
  {
    id: "non-ac-hall",
    name: "Non-AC Hall",
    tables: [
      { id: "t5", number: "T5", seats: 8, status: "occupied", captain: "Arjun", guests: 6 },
      { id: "t6", number: "T6", seats: 4, status: "available", captain: "Open", guests: 0 }
    ]
  },
  {
    id: "self-service",
    name: "Self Service",
    tables: [
      { id: "s3", number: "S3", seats: 4, status: "available", captain: "Open", guests: 0 },
      { id: "s4", number: "S4", seats: 2, status: "running", captain: "Priya", guests: 2 }
    ]
  }
];

export const categories = [
  { id: "starters", name: "Starters" },
  { id: "biryani", name: "Biryani" },
  { id: "beverages", name: "Beverages" }
];

export const menuItems = [
  { id: "paneer-tikka", name: "Paneer Tikka", price: 220, station: "Grill", categoryId: "starters" },
  { id: "chicken-lollipop", name: "Chicken Lollipop", price: 260, station: "Fry", categoryId: "starters" },
  { id: "veg-biryani", name: "Veg Biryani", price: 240, station: "Main Kitchen", categoryId: "biryani" },
  { id: "sweet-lime", name: "Sweet Lime Soda", price: 90, station: "Beverage", categoryId: "beverages" }
];

export const tableOrders = {
  t1: {
    orderNumber: 10024,
    tableId: "t1",
    tableNumber: "T1",
    areaName: "AC Hall 1",
    captain: "Karthik",
    guests: 3,
    notes: "Less spicy",
    items: [
      { id: "line-1", menuItemId: "paneer-tikka", name: "Paneer Tikka", quantity: 1, price: 220, note: "No onion", sentToKot: true },
      { id: "line-2", menuItemId: "sweet-lime", name: "Sweet Lime Soda", quantity: 2, price: 90, note: "Less sugar", sentToKot: false }
    ]
  },
  t2: {
    orderNumber: 10025,
    tableId: "t2",
    tableNumber: "T2",
    areaName: "AC Hall 1",
    captain: "Open",
    guests: 0,
    notes: "New table",
    items: []
  },
  t3: {
    orderNumber: 10026,
    tableId: "t3",
    tableNumber: "T3",
    areaName: "AC Hall 1",
    captain: "Naveen",
    guests: 4,
    notes: "Birthday table",
    items: [
      { id: "line-3", menuItemId: "chicken-lollipop", name: "Chicken Lollipop", quantity: 1, price: 260, note: "Extra spicy", sentToKot: true }
    ]
  },
  t5: {
    orderNumber: 10027,
    tableId: "t5",
    tableNumber: "T5",
    areaName: "Non-AC Hall",
    captain: "Arjun",
    guests: 6,
    notes: "Family order",
    items: [
      { id: "line-4", menuItemId: "veg-biryani", name: "Veg Biryani", quantity: 2, price: 240, note: "No garlic", sentToKot: false }
    ]
  },
  t6: {
    orderNumber: 10028,
    tableId: "t6",
    tableNumber: "T6",
    areaName: "Non-AC Hall",
    captain: "Open",
    guests: 0,
    notes: "New table",
    items: []
  },
  s3: {
    orderNumber: 10029,
    tableId: "s3",
    tableNumber: "S3",
    areaName: "Self Service",
    captain: "Open",
    guests: 0,
    notes: "Counter order",
    items: []
  },
  s4: {
    orderNumber: 10030,
    tableId: "s4",
    tableNumber: "S4",
    areaName: "Self Service",
    captain: "Priya",
    guests: 2,
    notes: "Quick service",
    items: [
      { id: "line-5", menuItemId: "sweet-lime", name: "Sweet Lime Soda", quantity: 1, price: 90, note: "Less sugar", sentToKot: true }
    ]
  }
};

export const kitchenInstructions = [
  "Less sugar",
  "Less spicy",
  "Extra spicy",
  "No onion",
  "No garlic"
];
