export const sharedServiceModes = [
  { id: "dine_in", label: "Dine-In", active: true },
  { id: "takeaway", label: "Takeaway" },
  { id: "delivery", label: "Delivery" }
];

export const sharedStaffProfiles = [
  {
    id: "captain",
    name: "Captain Karthik",
    role: "Captain",
    permissions: ["take_order", "assign_waiter", "send_kot", "move_table", "request_bill"]
  },
  {
    id: "waiter",
    name: "Waiter Priya",
    role: "Waiter",
    permissions: ["pickup_food", "deliver_food", "request_bill"]
  }
];

export const sharedWaiterTeam = ["Waiter Priya", "Waiter Rahul", "Waiter Devi"];

export const sharedAreas = [
  {
    id: "ac-hall-1",
    name: "AC Hall 1",
    pricingArea: "AC",
    tables: [
      { id: "t1", number: "T1", seats: 4, status: "running", guests: 3, captain: "Captain Karthik" },
      { id: "t2", number: "T2", seats: 6, status: "available", guests: 0, captain: "Captain Karthik" },
      { id: "t3", number: "T3", seats: 4, status: "occupied", guests: 2, captain: "Captain Karthik" }
    ]
  },
  {
    id: "family-hall",
    name: "Family Hall",
    pricingArea: "Non-AC",
    tables: [
      { id: "f1", number: "F1", seats: 8, status: "running", guests: 5, captain: "Captain Karthik" },
      { id: "f2", number: "F2", seats: 4, status: "available", guests: 0, captain: "Captain Karthik" }
    ]
  },
  {
    id: "self-service",
    name: "Self Service",
    pricingArea: "Self Service",
    tables: [
      { id: "s3", number: "S3", seats: 4, status: "available", guests: 0, captain: "Open" },
      { id: "s4", number: "S4", seats: 2, status: "running", guests: 2, captain: "Captain Karthik" }
    ]
  }
];

export const sharedCategories = [
  { id: "starters", name: "Starters" },
  { id: "mains", name: "Mains" },
  { id: "drinks", name: "Drinks" }
];

export const sharedMenuItems = [
  { id: "paneer-tikka", name: "Paneer Tikka", price: 220, stationId: "grill", stationName: "Grill", categoryId: "starters" },
  { id: "crispy-corn", name: "Crispy Corn", price: 180, stationId: "grill", stationName: "Grill", categoryId: "starters" },
  { id: "veg-biryani", name: "Veg Biryani", price: 240, stationId: "main", stationName: "Main Kitchen", categoryId: "mains" },
  { id: "butter-naan", name: "Butter Naan", price: 45, stationId: "main", stationName: "Main Kitchen", categoryId: "mains" },
  { id: "sweet-lime", name: "Sweet Lime", price: 90, stationId: "drinks", stationName: "Beverages", categoryId: "drinks" }
];

export const sharedKitchenInstructions = ["Less spicy", "No onion", "No garlic", "Extra hot", "Less sugar"];

export const sharedStations = [
  { id: "all", name: "All Stations" },
  { id: "grill", name: "Grill" },
  { id: "main", name: "Main Kitchen" },
  { id: "drinks", name: "Beverages" }
];

export const sharedOrders = {
  t1: {
    orderNumber: 10031,
    kotNumber: "KOT-10031",
    tableId: "t1",
    tableNumber: "T1",
    areaId: "ac-hall-1",
    areaName: "AC Hall 1",
    guests: 3,
    captain: "Captain Karthik",
    assignedWaiter: "Waiter Priya",
    pickupStatus: "ready",
    ageMinutes: 1,
    notes: "Ready for pickup",
    auditTrail: [
      { id: "t1-1", label: "KOT sent", actor: "Captain Karthik", time: "7:28 PM" },
      { id: "t1-2", label: "Marked ready", actor: "Chef Manoj", time: "7:31 PM" }
    ],
    items: [
      {
        id: "line-1",
        menuItemId: "paneer-tikka",
        name: "Paneer Tikka",
        quantity: 1,
        price: 220,
        note: "No onion",
        sentToKot: true,
        stationId: "grill",
        stationName: "Grill"
      }
    ]
  },
  t2: {
    orderNumber: 10032,
    kotNumber: "KOT-10032",
    tableId: "t2",
    tableNumber: "T2",
    areaId: "ac-hall-1",
    areaName: "AC Hall 1",
    guests: 0,
    captain: "Captain Karthik",
    assignedWaiter: "Waiter Rahul",
    pickupStatus: "new",
    ageMinutes: 0,
    notes: "Start order",
    auditTrail: [],
    items: []
  },
  t3: {
    orderNumber: 10033,
    kotNumber: "KOT-10033",
    tableId: "t3",
    tableNumber: "T3",
    areaId: "ac-hall-1",
    areaName: "AC Hall 1",
    guests: 2,
    captain: "Captain Karthik",
    assignedWaiter: "Waiter Priya",
    pickupStatus: "preparing",
    ageMinutes: 4,
    notes: "KOT accepted",
    auditTrail: [
      { id: "t3-1", label: "KOT sent", actor: "Captain Karthik", time: "7:34 PM" },
      { id: "t3-2", label: "Accepted in kitchen", actor: "Chef Manoj", time: "7:36 PM" }
    ],
    items: [
      {
        id: "line-2",
        menuItemId: "sweet-lime",
        name: "Sweet Lime",
        quantity: 2,
        price: 90,
        note: "Less sugar",
        sentToKot: true,
        stationId: "drinks",
        stationName: "Beverages"
      }
    ]
  },
  f1: {
    orderNumber: 10034,
    kotNumber: "KOT-10034",
    tableId: "f1",
    tableNumber: "F1",
    areaId: "family-hall",
    areaName: "Family Hall",
    guests: 5,
    captain: "Captain Karthik",
    assignedWaiter: "Waiter Devi",
    pickupStatus: "delivered",
    ageMinutes: 7,
    billRequested: true,
    billRequestedAt: "7:42 PM",
    notes: "Delivered",
    auditTrail: [
      { id: "f1-1", label: "Delivered to table", actor: "Waiter Devi", time: "7:40 PM" },
      { id: "f1-2", label: "Bill requested", actor: "Waiter Devi", time: "7:42 PM" }
    ],
    items: [
      {
        id: "line-3",
        menuItemId: "veg-biryani",
        name: "Veg Biryani",
        quantity: 2,
        price: 240,
        note: "Extra hot",
        sentToKot: true,
        stationId: "main",
        stationName: "Main Kitchen"
      }
    ]
  },
  f2: {
    orderNumber: 10035,
    kotNumber: "KOT-10035",
    tableId: "f2",
    tableNumber: "F2",
    areaId: "family-hall",
    areaName: "Family Hall",
    guests: 0,
    captain: "Captain Karthik",
    assignedWaiter: "Waiter Priya",
    pickupStatus: "new",
    ageMinutes: 0,
    notes: "Ready for new guests",
    auditTrail: [],
    items: []
  },
  s3: {
    orderNumber: 10036,
    kotNumber: "KOT-10036",
    tableId: "s3",
    tableNumber: "S3",
    areaId: "self-service",
    areaName: "Self Service",
    guests: 0,
    captain: "Open",
    assignedWaiter: "Waiter Rahul",
    pickupStatus: "new",
    ageMinutes: 0,
    notes: "Counter order",
    auditTrail: [],
    items: []
  },
  s4: {
    orderNumber: 10037,
    kotNumber: "KOT-10037",
    tableId: "s4",
    tableNumber: "S4",
    areaId: "self-service",
    areaName: "Self Service",
    guests: 2,
    captain: "Captain Karthik",
    assignedWaiter: "Waiter Priya",
    pickupStatus: "ready",
    ageMinutes: 6,
    notes: "Quick service pickup",
    auditTrail: [
      { id: "s4-1", label: "KOT sent", actor: "Captain Karthik", time: "7:25 PM" },
      { id: "s4-2", label: "Marked ready", actor: "Chef Iqbal", time: "7:31 PM" }
    ],
    items: [
      {
        id: "line-4",
        menuItemId: "sweet-lime",
        name: "Sweet Lime",
        quantity: 1,
        price: 90,
        note: "Less sugar",
        sentToKot: true,
        stationId: "drinks",
        stationName: "Beverages"
      }
    ]
  }
};
