// Shared localStorage keys — POS reads these for low-stock alerts
export const INVENTORY_TRACKING_KEY = "pos_inventory_tracking";
export const INVENTORY_WASTAGE_KEY  = "pos_inventory_wastage";

export const SESSIONS = ["Breakfast", "Lunch", "Dinner"];
export const UNITS    = ["Pcs", "Kg", "Ltr", "Plate", "Bowl", "Cup"];

export const OUTLETS  = [
  "All Branches",
  "Indiranagar",
  "Koramangala",
  "HSR Layout",
  "Whitefield"
];

// Base menu items catalog — owner enables tracking per item
export const menuCatalog = [
  { id: "paneer-tikka",    name: "Paneer Tikka",           category: "Starters" },
  { id: "crispy-corn",     name: "Crispy Corn",            category: "Starters" },
  { id: "veg-biryani",     name: "Veg Biryani",            category: "Mains"    },
  { id: "butter-naan",     name: "Butter Naan",            category: "Mains"    },
  { id: "dal-makhani",     name: "Dal Makhani",            category: "Mains"    },
  { id: "sweet-lime",      name: "Sweet Lime Soda",        category: "Drinks"   },
  { id: "masala-chai",     name: "Masala Chai",            category: "Drinks"   },
  { id: "cold-coffee",     name: "Cold Coffee",            category: "Drinks"   }
];

// Default tracking config per item — stored in localStorage after owner edits
export const defaultTracking = [
  {
    id: "paneer-tikka",
    trackingEnabled: true,
    posVisible: true,
    unit: "Pcs",
    sessions: {
      Breakfast: { opening: 0,  current: 0  },
      Lunch:     { opening: 30, current: 22 },
      Dinner:    { opening: 25, current: 18 }
    }
  },
  {
    id: "veg-biryani",
    trackingEnabled: true,
    posVisible: true,
    unit: "Pcs",
    sessions: {
      Breakfast: { opening: 0,  current: 0  },
      Lunch:     { opening: 40, current: 8  },
      Dinner:    { opening: 35, current: 35 }
    }
  },
  {
    id: "butter-naan",
    trackingEnabled: true,
    posVisible: true,
    unit: "Pcs",
    sessions: {
      Breakfast: { opening: 50, current: 40 },
      Lunch:     { opening: 80, current: 62 },
      Dinner:    { opening: 60, current: 60 }
    }
  },
  {
    id: "masala-chai",
    trackingEnabled: true,
    posVisible: true,
    unit: "Cup",
    sessions: {
      Breakfast: { opening: 60, current: 38 },
      Lunch:     { opening: 30, current: 30 },
      Dinner:    { opening: 20, current: 20 }
    }
  }
];

// Sample wastage log
export const wastageLogSeed = [
  {
    id: "w1",
    item: "Veg Biryani",
    amount: 3,
    value: 720,
    unit: "Pcs",
    session: "Lunch",
    branch: "Indiranagar",
    enteredBy: "Manager",
    time: "1:45 PM"
  },
  {
    id: "w2",
    item: "Paneer Tikka",
    amount: 2,
    value: 440,
    unit: "Pcs",
    session: "Dinner",
    branch: "Koramangala",
    enteredBy: "Cashier",
    time: "9:10 PM"
  }
];
