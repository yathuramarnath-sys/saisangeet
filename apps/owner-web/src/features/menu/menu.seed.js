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
      badges: ["Area + service pricing", "Available"],
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
      badges: ["Area + service pricing", "Available"],
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
      badges: ["Pricing pending", "Needs setup"],
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
      badges: ["Area + service pricing", "Available"],
      pricing: [
        { area: "AC", dineIn: "Rs 210", takeaway: "Rs 200", delivery: "Rs 220" },
        { area: "Non-AC", dineIn: "Rs 200", takeaway: "Rs 195", delivery: "Rs 215" },
        { area: "Self Service", dineIn: "Rs 185", takeaway: "Rs 180", delivery: "Rs 205" }
      ],
      actions: ["Edit", "Favorite", "Price"]
    }
  ]
};
