export const menuSeedData = {
  categories: [
    { id: "starters", name: "Starters", count: 22, active: true },
    { id: "main-course", name: "Main Course", count: 48, active: false },
    { id: "biryani", name: "Biryani", count: 18, active: false },
    { id: "tandoor", name: "Tandoor", count: 20, active: false },
    { id: "beverages", name: "Beverages", count: 24, active: false },
    { id: "desserts", name: "Desserts", count: 16, active: false }
  ],
  items: [
    {
      id: "paneer-tikka",
      name: "Paneer Tikka",
      station: "Grill station",
      gstLabel: "GST 5%",
      status: "Favorite",
      foodType: "Veg",
      badges: ["Area + service pricing", "Available", "Tracked"],
      inventoryTracking: {
        enabled: true,
        mode: "Item wise",
        note: "Track sellable stock for POS and waiter ordering"
      },
      salesAvailability: "Available",
      outletAvailability: [
        { outlet: "Indiranagar", enabled: true },
        { outlet: "Koramangala", enabled: true },
        { outlet: "HSR Layout", enabled: false }
      ],
      pricing: [
        { area: "AC", dineIn: "Rs 220", takeaway: "Rs 210", delivery: "Rs 230" },
        { area: "Non-AC", dineIn: "Rs 210", takeaway: "Rs 205", delivery: "Rs 225" },
        { area: "Self Service", dineIn: "Rs 195", takeaway: "Rs 190", delivery: "Rs 215" }
      ],
      actions: ["Edit", "Pricing", "Duplicate", "Disable"]
    },
    {
      id: "chicken-lollipop",
      name: "Chicken Lollipop",
      station: "Fry station",
      gstLabel: "GST 5%",
      status: "Live",
      foodType: "Non-Veg",
      badges: ["Area + service pricing", "Available", "Not tracked"],
      inventoryTracking: {
        enabled: false,
        mode: "Optional",
        note: "Restaurant can sell this item without inventory tracking"
      },
      salesAvailability: "Available",
      outletAvailability: [
        { outlet: "Indiranagar", enabled: true },
        { outlet: "Koramangala", enabled: true },
        { outlet: "HSR Layout", enabled: true }
      ],
      pricing: [
        { area: "AC", dineIn: "Rs 260", takeaway: "Rs 250", delivery: "Rs 275" },
        { area: "Non-AC", dineIn: "Rs 245", takeaway: "Rs 240", delivery: "Rs 265" },
        { area: "Self Service", dineIn: "Rs 235", takeaway: "Rs 230", delivery: "Rs 255" }
      ],
      actions: ["Edit", "Pricing", "Tax", "Station"]
    },
    {
      id: "masala-papad",
      name: "Masala Papad",
      station: "Station missing",
      gstLabel: "GST missing",
      status: "Review",
      foodType: "Veg",
      badges: ["Pricing pending", "Needs setup", "Not tracked"],
      inventoryTracking: {
        enabled: false,
        mode: "Optional",
        note: "Enable only if this item should participate in sales stock"
      },
      salesAvailability: "Sold Out",
      outletAvailability: [
        { outlet: "Indiranagar", enabled: false },
        { outlet: "Koramangala", enabled: true },
        { outlet: "HSR Layout", enabled: false }
      ],
      pricing: [
        { area: "AC", dineIn: "Not set", takeaway: "Not set", delivery: "Not set" },
        { area: "Non-AC", dineIn: "Not set", takeaway: "Not set", delivery: "Not set" },
        { area: "Self Service", dineIn: "Not set", takeaway: "Not set", delivery: "Not set" }
      ],
      actions: ["Set pricing", "Assign GST", "Map station"],
      review: true,
      compact: true
    },
    {
      id: "corn-cheese-balls",
      name: "Corn Cheese Balls",
      station: "Fry station",
      gstLabel: "GST 5%",
      status: "Live",
      foodType: "Veg",
      badges: ["Area + service pricing", "Available", "Tracked"],
      inventoryTracking: {
        enabled: true,
        mode: "Category wise",
        note: "Included in opening stock category-wise sales tracking"
      },
      salesAvailability: "Available",
      outletAvailability: [
        { outlet: "Indiranagar", enabled: true },
        { outlet: "Koramangala", enabled: false },
        { outlet: "HSR Layout", enabled: true }
      ],
      pricing: [
        { area: "AC", dineIn: "Rs 210", takeaway: "Rs 200", delivery: "Rs 220" },
        { area: "Non-AC", dineIn: "Rs 200", takeaway: "Rs 195", delivery: "Rs 215" },
        { area: "Self Service", dineIn: "Rs 185", takeaway: "Rs 180", delivery: "Rs 205" }
      ],
      actions: ["Edit", "Favorite", "Price"]
    }
  ],
  menuGroups: [
    {
      id: "all-day",
      name: "All Day Menu",
      status: "Live",
      itemCount: 142,
      channels: "Dine-In, Takeaway, Delivery",
      note: "Primary menu used through the full service day"
    },
    {
      id: "breakfast",
      name: "Breakfast Menu",
      status: "Scheduled",
      itemCount: 26,
      channels: "Dine-In, Takeaway",
      note: "Shown from 7:00 AM to 11:00 AM"
    },
    {
      id: "delivery-only",
      name: "Delivery Specials",
      status: "Review",
      itemCount: 18,
      channels: "Delivery",
      note: "Owner should review pricing and availability before launch"
    }
  ],
  menuAssignments: [
    {
      id: "assign-1",
      menu: "All Day Menu",
      outlet: "Indiranagar",
      channels: "Dine-In, Takeaway, Delivery",
      availability: "Always on",
      status: "Ready"
    },
    {
      id: "assign-2",
      menu: "Breakfast Menu",
      outlet: "Koramangala",
      channels: "Dine-In, Takeaway",
      availability: "7:00 AM - 11:00 AM",
      status: "Scheduled"
    },
    {
      id: "assign-3",
      menu: "Delivery Specials",
      outlet: "HSR Layout",
      channels: "Delivery",
      availability: "6:00 PM - 10:30 PM",
      status: "Review"
    }
  ],
  menuAlerts: [
    {
      id: "delivery-review",
      title: "Delivery Specials menu needs review",
      description: "Check pricing and assign final outlets before enabling it for online channels."
    },
    {
      id: "breakfast-window",
      title: "Breakfast menu should auto-switch by time",
      description: "Schedule support can be added later, but menu grouping is ready now."
    }
  ]
};
